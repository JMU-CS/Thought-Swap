var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var async = require('async');
var mysql = require('mysql');

// MySQL database initialization
var connection = mysql.createConnection({
    host: 'localhost',
    user: 'thoughtswap',
    password: 'thoughtswap',
    database: 'thoughtswap'
});

connection.connect();

//-------------------------------------------------------------------------
/**
 *  The server file for the ThoughtSwap app, handles client interaction
 *  and provides functionality on the back-end that controllers alone
 *  are insufficient for. Also handles all data logging required for
 *  user research.
 *
 *  @authors Michael Stewart, Adam Barnes
 *  @version v 1.0.0  (2014)
 */
//-------------------------------------------------------------------------



/**
 * INCLUDE SILLYNAMES: Got the lists for this from
 * http://stackoverflow.com/q/16826200/1449799
 */
function makeName() {
    var firstName = ["Runny", "Buttercup", "Dinky", "Stinky", "Crusty",
        "Greasy", "Gidget", "Cheesypoof", "Lumpy", "Wacky", "Tiny", "Flunky",
        "Fluffy", "Zippy", "Doofus", "Gobsmacked", "Slimy", "Grimy", "Salamander",
        "Oily", "Burrito", "Bumpy", "Loopy", "Snotty", "Irving", "Egbert", "Waffer", "Lilly", "Rugrat", "Sand", "Fuzzy", "Kitty",
        "Puppy", "Snuggles", "Rubber", "Stinky", "Lulu", "Lala", "Sparkle", "Glitter",
        "Silver", "Golden", "Rainbow", "Cloud", "Rain", "Stormy", "Wink", "Sugar",
        "Twinkle", "Star", "Halo", "Angel"
    ];

    // var middleName =["Waffer", "Lilly","Rugrat","Sand", "Fuzzy","Kitty",
    //  "Puppy", "Snuggles","Rubber", "Stinky", "Lulu", "Lala", "Sparkle", "Glitter",
    //  "Silver", "Golden", "Rainbow", "Cloud", "Rain", "Stormy", "Wink", "Sugar",
    //  "Twinkle", "Star", "Halo", "Angel"];

    var lastName1 = ["Snicker", "Buffalo", "Gross", "Bubble", "Sheep",
        "Corset", "Toilet", "Lizard", "Waffle", "Kumquat", "Burger", "Chimp", "Liver",
        "Gorilla", "Rhino", "Emu", "Pizza", "Toad", "Gerbil", "Pickle", "Tofu",
        "Chicken", "Potato", "Hamster", "Lemur", "Vermin"
    ];

    var lastName2 = ["face", "dip", "nose", "brain", "head", "breath",
        "pants", "shorts", "lips", "mouth", "muffin", "butt", "bottom", "elbow",
        "honker", "toes", "buns", "spew", "kisser", "fanny", "squirt", "chunks",
        "brains", "wit", "juice", "shower"
    ];

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }

    // return [
    //     firstName[getRandomInt(0, firstName.length)],
    //     // middleName[getRandomInt(0, middleName.length)], 
    //     lastName1[getRandomInt(0, lastName1.length)],
    //     lastName2[getRandomInt(0, lastName2.length)]
    // ];

    return firstName[getRandomInt(0, firstName.length)] + ' ' +
        lastName1[getRandomInt(0, lastName1.length)] +
        lastName2[getRandomInt(0, lastName2.length)];
}
//-------------------------------------------------------------------------

/**
 * ~~ Initialization ~~
 * Steps required to start up the app and provide future functions with
 * variables they will use.
 */
app.use(express.static(__dirname + '/app'));

var port = 3003;
http.listen(port, function() {
    console.log('listening on *:', port);
});

var allThoughts = {}; // allThoughts = socketid: 
// [{ id: socket.id, thought: thought1, databaseId: insertId}, 
//  { id: socket.id, thought: thought2, databaseId: insertId}, ...]

var chronologicalThoughts = []; // list of thoughts for the teacher view as they are recieved
var newQuestion = '';
var currentPromptId = -1;
var role_ids = {
    teacher: 1,
    student: 2
};

/**
 * Will return the number of unique ids in allThoughts which correlates
 * to the amount of submitters.
 */
function numSubmitters() {
    return Object.keys(allThoughts).length;
}

/**
 * Will add the thoughts recieved to an array that is sent to the
 * teacher's view.
 */
function addThought(socket, thought, id) {
    var newThought = {
        id: socket.id,
        thought: thought,
        databaseId: id
    };
    //console.log(newThought);
    chronologicalThoughts.push(newThought);
    if (allThoughts.hasOwnProperty(socket.id)) {
        allThoughts[socket.id].push(newThought);
    } else {
        //this means we just got a new submitter
        allThoughts[socket.id] = [newThought];
        socket.broadcast.to('teacher').emit('num-submitters', numSubmitters());
    }
}

function generateAddStudentFunctions (n, classId) {
    var tasklist = [];
    for (var i = 0; i < n; i++) {
        tasklist.push(function (callback) {
            addStudent(classId, callback);
        });
    }
    return tasklist;
}

function addStudent(classId, callback) {
    var name = makeName();
    var searchName = 'select * from users where name=?';
    connection.query(searchName, [name], function(error, results) {
        if (error) {
            callback(error);
            return;
        }
        console.log('addStudent results');
        console.log(results);
        if (results.length > 0) {
            addStudent(classId, callback);
        } else {
            var addStudent = 'insert into users (name) values (?)';
            connection.query(addStudent, [name], function(error, results) {
                if (error) {
                    callback(error);
                    return;
                }
                var userId = results.insertId;
                var membershipQuery = 'insert into thoughtswap_role_memberships (user_id, role_id, group_id) values (?, ?, ?)';
                connection.query(membershipQuery, [userId, 2, classId], function(error, results) {
                    console.log("Added user " + userId + " to class " + classId);
                    console.log('membershipQuery results', results);
                    if (error) {
                        console.log('callback error', error);
                        callback(error);
                    }

                    callback(null, {id:results.insertId, name:name});
                });
            });
        }
    });
    return {
        username: name
    };
}

function getClientId(socketId, callback) {
    var selectClient_id = 'select id from thoughtswap_clients where socket_id=?;'
    connection.query(selectClient_id, [socketId], function(err, results) {
        //console.log('getClientId', err, results);
        if (results.length > 0) {
            callback(results[0].id);
        }
    });
}

// function getNames(count, classId, teacherId) {
//     var names = [];
//     for (var i = 0; i < count; i++) {
//         names[i] = addStudent(classId);
//     }
//     return names;
// }

function getClasses(connectionInfo, socket) {
    var detailsQuery = 'SELECT g.name as "name", others.name as "username", others.id as "uid" ' +
        'from thoughtswap_groups g ' +
        'JOIN thoughtswap_role_memberships m on m.group_id=g.id and m.role_id=2 ' +
        'JOIN users others on others.id = m.user_id ' +
        'WHERE g.owner=? order by g.id;';
    connection.query(detailsQuery, [connectionInfo.teacherId], function(error, results) {
        if (error) {
            console.log('getClasses error', error);
        }
        console.log('getClasses results', results);

        socket.emit('load-classes', results);
    });
}

//-------------------------------------------------------------------------

/**
 * ~~ Activity ~~
 * The main functions of the server, listening for events on the client
 * side and responding appropriately.
 */
io.sockets.on('connection', function(socket) {
    console.log('>> Client Connected  >> ');
    var connectionInfo = {};

    /**
     * Database Query: Will log relevant data in the socket_id, and
     * connect columns for the CLIENTS table
     */
    var clientQuery = 'insert into thoughtswap_clients(socket_id, connect) values(?, ?);'
    connection.query(clientQuery, [socket.id, new Date()], function(err, results) {
        //console.log('connect', err, results);
        if (results.hasOwnProperty('insertId')) {
            connectionInfo['client_id'] = results.insertId;
        }
    });

    /**
     * Will catch when a client leaves the app interface entirely and send
     * out the updated number of connected students for the teacher view.
     */
    socket.on('disconnect', function() {
        console.log('<< Client Disconnected << ');

        /**
         * Database Query: Will log relevant data in the disconnect
         * column for the CLIENTS table
         */
        // getClientId(socket.id, function (clientId) {
        var clientQuery = 'update thoughtswap_clients set disconnect=? where id=?;'
        connection.query(clientQuery, [new Date(), connectionInfo.client_id], function(err, results) {
            //console.log('client disconnect updated', err, results);
        });
        // });

        if (io.nsps['/'].adapter.rooms.hasOwnProperty('student')) {


            socket.broadcast.emit('num-students',
                Object.keys(io.nsps['/'].adapter.rooms['student']).length);
        }

    });

    /**
     * Will catch when a student submits a thought and send that info
     * to teachers
     */
    socket.on('new-thought-from-student', function(newThought) {

        /**
         * Database Query: Will log relevant data in the content, client_id,    ***Still need to add group_id support***
         * prompt_id, columns to the THOUGHTS table
         */
        // getClientId(socket.id, function (clientId) {
        var queryParams = [newThought, new Date(), connectionInfo.client_id];

        var thoughtQuery = 'insert into thoughtswap_thoughts(content, recieved, author_id) values(?, ?, ?);'
        if (currentPromptId != -1) {
            thoughtQuery = 'insert into thoughtswap_thoughts(content, recieved, author_id, prompt_id) values(?, ?, ?, ?);'
            queryParams.push(currentPromptId);
        }

        connection.query(thoughtQuery, queryParams, function(err, results) {
            //console.log('new thought logged', err, results);
            addThought(socket, newThought, results.insertId);

        });
        // });

        //console.log('New Thought');

        socket.broadcast.to('teacher').emit('new-thought-from-student', newThought);
    });


    /**
     * Will listen for a prompt from teachers and send it along to students.
     */
    socket.on('new-prompt', function(newPrompt) {

        /**
         * Database Query: Will log relevant data in the content and recieved
         * columns of the PROMPTS table
         */
        var promptQuery = 'insert into thoughtswap_prompts(content, recieved) values(?, ?);'
        connection.query(promptQuery, [newPrompt, new Date()], function(err, results) {
            //console.log('prompt logged', err, results);

            currentPromptId = results.insertId;
        });

        console.log('Prompt recieved');
        socket.broadcast.to('student').emit('new-prompt', newPrompt);
        newQuestion = newPrompt;
    });

    /**
     * Will catch when a teacher initiates a new session and set server
     * variables back to their initial state.
     */
    socket.on('new-session', function() {
        console.log('new session initiated');
        socket.broadcast.emit('new-session');
        allThoughts = {};
        chronologicalThoughts = [];
        newQuestion = '';
    })

    /**
     * Will catch when a teacher connects, then add them to the teacher
     * room after ensuring they are not in the student room, then update
     * counts accordingly. It will also sync available data for
     * teachers who may have joined after a session has begun.
     */
    socket.on('teacher', function() {
        console.log('Teacher Joined')
        socket.leave('student');
        socket.join('teacher');

        socket.emit('thought-sync', {
            thoughts: chronologicalThoughts,
            connected: Object.keys(io.nsps['/'].adapter.rooms['student']).length,
            submitters: numSubmitters()
        });

        socket.broadcast.emit('num-students',
            Object.keys(io.nsps['/'].adapter.rooms['student']).length);
    });

    /**
     * Will catch when a student connects, then add them to the student
     * room after ensuring they are not in the teacher room, then update
     * counts accordingly.
     */
    socket.on('student', function() {
        socket.leave('teacher');
        socket.join('student');

        io.sockets.emit('prompt-sync', newQuestion); // Just this channel

        socket.broadcast.emit('num-students',
            Object.keys(io.nsps['/'].adapter.rooms['student']).length);
    });

    //-------------------------------------------------------------------------
    /**
     * ~~ Primary Feature ~~
     * Will catch when a teacher chooses to distribute the thoughts
     * they have recieved. Performs the work nessessary to implement
     * distribution to each student.
     */
    socket.on('distribute', function() {
        console.log('got distribute msg');

        // Unique IDS of all students that thoughts need to be distributed to
        var recipients = Object.keys(io.nsps['/'].adapter.rooms['student']);

        // if (recipients >= 2) {
        //   socket.broadcast.emit('enough-submitters');
        // }

        // console.log('enough submitters present, distributing...');

        // Placeholder variable for the distribute operation
        var flatThoughts = [];
        var studentSubmitters = Object.keys(allThoughts);

        for (var i = 0; i < studentSubmitters.length; i++) {
            flatThoughts = flatThoughts.concat(allThoughts[studentSubmitters[i]])
        }

        var originalFlatThoughts = flatThoughts.slice();

        /**
         * Shuffle algorithm for randomizing an array.
         */
        function shuffle(o) { //v1.0 courtesy of Google
            for (var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
            return o;
        };

        /**
         * Will ensure that the ammount of thoughts up for distribution is the
         * same as the number of possible recipients.
         */
        if (recipients.length > originalFlatThoughts.length) {
            console.log('Thoughts will be fixed');
            var diff = recipients.length - originalFlatThoughts.length;
            for (var i = 0; i < diff; i++) {
                flatThoughts.push(originalFlatThoughts[Math.floor((Math.random() * originalFlatThoughts.length))]);
            }
        }

        console.log('Preparing to shuffle');

        var shuffledFlatThoughts = flatThoughts.slice();
        shuffle(shuffledFlatThoughts);

        /**
         * Will loop through two arrays, returning true if a match
         * between them is found, false if no matches exists.
         */
        function hasMatch(a, b) {
            for (var i = 0; i < a.length; i++) {
                if (a[i].id == b[i]) {
                    return true;
                };
            };
            return false;
        };

        /**
         * Will take the shuffled arrays and reshuffle if nessessary
         * to ensure no student recieves the same thought they submitted.
         */
        while (hasMatch(shuffledFlatThoughts, recipients)) {
            shuffle(shuffledFlatThoughts);
        }

        console.log('reshuffling complete');


        /**
         * Will methodically send each student their newly assigned
         * thought, traveling through the old distribution until completion.
         */
        //console.log(shuffledFlatThoughts);
        for (var i = 0; i < recipients.length; i++) {
            //console.log(shuffledFlatThoughts[i]);

            /**
             * Database Query: Will log relevant data in the thought_id, and
             * reader_id, columns to the DISTRIBUTIONS table
             */
            function getCallback(j) { //read about closures and evaluation and scope in javascript (maybe in michael's programming languages book)
                return function(clientId) {
                    //console.log(j);
                    var distributeQuery =
                        'insert into thoughtswap_distributions(thought_id, reader_id, distributedAt) values(?, ?, ?);'

                    connection.query(distributeQuery, [shuffledFlatThoughts[j].databaseId, clientId, new Date()],
                        function(err, results) {

                            //console.log('distributions table filled in', err, results);
                        });
                }
            }

            getClientId(recipients[i], getCallback(i));


            socket.to(recipients[i]).emit('new-distribution',
                shuffledFlatThoughts[i].thought);
        }

        // console.log('completed sending messages');
        // console.log('flatThoughts', flatThoughts);
        // console.log('recipients', recipients);
        // console.log('shuffledFlatThoughts', shuffledFlatThoughts);
    });

    //-------------------------------------------------------------------------
    /**
     * ~~ USER SERVICE ~~
     * Will handle the registration process for new users.
     */
    function getUserInfo(teacherDbId, userInfoCallback) {
        var ownedGroups = "select * from thoughtswap_groups where owner=?"; //teacherDbId
        connection.query(ownedGroups, [teacherDbId], function(ownedError, ownedResults) {
            if (ownedError) {
                console.log(ownedError);
            } else {
                var teacherPermissions = "select * from thoughtswap_role_memberships where user_id=?" //teacherDbId
                connection.query(teacherPermissions, [teacherDbId], function(permissionsError, permissionsResults) {
                    if (permissionsError) {
                        console.log(permissionsError);
                    } else {
                        userInfoCallback({
                            permissions: permissionsResults,
                            groups: ownedResults
                        });
                    }
                });
            }
        });
        userInfoCallback(null);
    }

    socket.on('new-registration', function(registrationData) {
        console.log("New User: ", registrationData);
        var usernames = 'select * from users where name=?';
        connection.query(usernames, [registrationData.username], function(error, results) {
            if (error) {
                console.log(error);
            } else {
                if (results.length > 0) {
                    var message = "Username already exists";
                    console.log(message);
                    socket.emit('registration-failed', message);
                } else if (registrationData.email == null || registrationData.email.length == 0) {
                    message = "invalid email"
                    console.log(message);
                    socket.emit('registration-failed', message);
                } else {
                    var newUser = 'insert into users (name, password, email) values (?, ?, ?)';
                    connection.query(newUser, [registrationData.username, registrationData.password, registrationData.email], function(error, results) {
                        var teacherDbId = results.insertId;
                        if (userInfo == null) {
                                                    console.log('userInfocallback came back null');
                            } else {
                                socket.emit('user-logged-in', {
                                        uid: teacherDbId,
                                        username: registrationData.username,
                                        permissions: [],
                                        groups: [],
                                        teacher: true

                                                     });
                        // if (error) { //maybe need a better condition here
                        //     socket.emit('registration-failed', error.message);
                        //     console.log('New User query failed', error);
                        // } else {
                        //     //create a class wwith 0 students
                        //     console.log('User insert results', results);
                        //     var teacherDbId = results.insertId;
                        //     var newGroup = "insert into thoughtswap_groups (name, owner) values (?,?);"
                        //     connection.query(newGroup, [registrationData.username, teacherDbId], function(newGroupError, newGroupResults) {
                        //         if (newGroupError) {
                        //             console.log(newGroupError);
                        //         } else {
                        //             //make them a teacher of that class
                        //             var newRoleMembership = "insert into thoughtswap_role_memberships (user_id, role_id, group_id) values (?,?, ?);"
                        //             console.log('About to insert', newRoleMembership, [teacherDbId, role_ids.teacher, newGroupResults.insertId]);
                        //             connection.query(newRoleMembership, [teacherDbId, role_ids.teacher, newGroupResults.insertId], function(newRoleError, newRoleResults) {
                        //                 if (newRoleError) {
                        //                     console.log(newRoleError);
                        //                 } else {
                        //                     //we need to send back the uid, the roles, and the owned groups
                        //                    getUserInfo(teacherDbId, function(userInfo) {
                        //                         if (userInfo == null) {
                        //                             console.log('userInfocallback came back null');
                        //                         } else {
                        //                             socket.emit('user-logged-in', {
                        //                                 uid: teacherDbId,
                        //                                 username: registrationData.username,
                        //                                 permissions: userInfo.permissions,
                        //                                 groups: userInfo.groups,
                        //                                 teacher: true
                        //                             });
                        //                         }
                        //                     });

                        //                 }
                        //             });

                        //         }

                        //     });
                        // }
                    });
                }
            }
        });
        // socket.emit('login-attempt', {success:true});
        // socket.emit('login-attempt', {success:false});
        // socket.emit('login-teacher-attempt', {success:true, uid:1, username:'awesome'});
    });

    /**
     * Will handle the login process for returning users and student sillynames
     */
    socket.on('teacher-login-attempt', function(authenticationInfo) {
        console.log('Searching for ', authenticationInfo.username);

        var returningUser = 'select * from users where name=?';
        connection.query(returningUser, [authenticationInfo.username], function(error, results) {
            if (authenticationInfo.username == results[0].name && authenticationInfo.password == results[0].password) {
                console.log(results, "User match, Line on login-teacher-attempt");
                connectionInfo['teacherId'] = results[0].id;

                socket.emit('user-logged-in', {
                    username: authenticationInfo.username,
                    teacher: true
                });

                console.log('Teacher Logged In Status is ', loggedIn);
                getClasses(connectionInfo, socket);
            } else {
                console.log('teacher login failed');
                socket.emit('login-failed', error);
            }
        });
    });

    socket.on('student-login-attempt', function(sillyname) {
        console.log('Searching for ', sillyname);
        var returningUser = 'select * from users where name=?';
        connection.query(returningUser, [sillyname], function(error, results) {
            if (error) {
                console.log(error);
            }
            console.log(results);
            var loggedIn = false;
            var studentDbId = results[0].insertId;

            for (var i = 0; i < results.length; i++) {
                if (sillyname == results[i].name) {
                    loggedIn = true;
                    console.log("User match");
                }
            }
            socket.emit('user-logged-in', loggedIn);
            console.log('Student Logged In Status is ', loggedIn);
        });
    });

    socket.on('create-class', function(class_name, number) {
        console.log('class_name : ', class_name);
        console.log('number : ', number);
        var newClassQuery = 'insert into thoughtswap_groups(name, owner) values (?, ?)';
        console.log('connectionInfo.teacherId');
        console.log(connectionInfo.teacherId);
        connection.query(newClassQuery, [class_name, connectionInfo.teacherId], function(error, results) {
            console.log('error');
            console.log(error);
            console.log('results');
            console.log(results);

            var groupId = results.insertId;

            var teacherRole = 'insert into thoughtswap_role_memberships (user_id, role_id, group_id) values (?, ?, ?)';
            connection.query(teacherRole, [connectionInfo.teacherId, 1, groupId], function(error, results) {
                console.log('error');
                console.log(error);
                console.log('results');
                console.log(results);
            });

            async.parallel(generateAddStudentFunctions(number, groupId), function (error, results) {
                if (error) {
                    console.log('error adding students in create-class', error);
                }
                console.log('async results', results);
                var studentList = results;
                socket.emit('class-created', class_name, number, studentList);
            });

            //return the names list that goes with this class
            // getClasses(connectionInfo, socket);
        });
    });

});
