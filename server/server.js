"use strict";

// Third-Party Dependencies
var express = require('express');
var app = express();
var http = require('http').Server(app);
var Promise = require('bluebird'); // jshint ignore:line
var io = require('socket.io')(http);
// var mysql = require('mysql'); // jshint ignore:line
var bodyParser = require('body-parser');
var findMatching = require('bipartite-matching');
var bcrypt = require('bcrypt-nodejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
// Self Dependencies
var models = require('./app.models');

// ============================================================================
// Helper Functions

/**
 * Function for creating semi-anonymous participant users
 * List of names credit goes to: http://stackoverflow.com/q/16826200/1449799
 * @return: STRING - sillyname in the form 'firstName lastName1+lastName2'
 */
function makeName() {
  var firstName = ['Almond', 'Orange', 'Apricot', 'Aquamarine', 'Asparagus', 'Bittersweet',
    'Black', 'Blue', 'BlueBell', 'Melon', 'Magenta', 'Tan', 'Blush',
    'BrickRed', 'Lavender', 'Brown', 'Scarlet', 'Pink', 'Peach', 'Shadow',
    'Canary', 'Denim', 'Carmine', 'White', 'Sunglow', 'Cerise', 'Cerulean', 'Sepia',
    'Gold', 'Beaver', 'Yellow', 'Copper', 'Maize', 'Red', 'Cranberry', 'Dandelion',
    'Violet', 'Silver', 'Eggplant', 'Fern', 'Orchid', 'Fuchsia', 'FuzzyWuzzy',
    'Geranium', 'Indigo', 'Mauve', 'Goldenrod', 'Shamrock', 'Gray', 'Green', 'Plum'
  ];

  // var middleName =['Waffer', 'Lilly','Rugrat','Sand', 'Fuzzy','Kitty',
  //  'Puppy', 'Snuggles','Rubber', 'Stinky', 'Lulu', 'Lala', 'Sparkle', 
  //  'Glitter', 'Silver', 'Golden', 'Rainbow', 'Cloud', 'Rain', 'Stormy',
  //  'Wink', 'Sugar', 'Twinkle', 'Star', 'Halo', 'Angel']

   var lastName1 = ['Sepia', 'Inchworm', 'Indigo', 'Cranberry', 'Dandelion', 'Lavender',
    'Apricot', 'LightBlue', 'Asparagus', 'Madder', 'Magenta', 'Mahogany', 'Maize',
    'Manatee', 'Gold', 'Mauve', 'Silver', 'Salmon', 'Shadow', 'Sunglow', 'White',
    'Yellow', 'Eggplant', 'Beaver', 'Violet', 'Fern', 'Scarlet'
  ];

  var lastName2 = ['Melon', 'Almond', 'Tan', 'Peach', 'Fuchsia', 'Green',
    'Brown', 'Chestnut', 'Thistle', 'Red', 'Blush', 'Denim', 'Mulberry', 'Cerise',
    'Wisteria', 'Orange', 'OrangeRed', 'Blue', 'Orchid', 'Carmine', 'Canary', 'Pink',
    'Periwinkle', 'Copper', 'Plum', 'Gray'
  ];

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  // return [
  //     firstName[getRandomInt(0, firstName.length)],
  //     // middleName[getRandomInt(0, middleName.length)],
  //     lastName1[getRandomInt(0, lastName1.length)],
  //     lastName2[getRandomInt(0, lastName2.length)]
  // ]

  return firstName[getRandomInt(0, firstName.length)] + ' ' +
   lastName1[getRandomInt(0, lastName1.length)] +
    lastName2[getRandomInt(0, lastName2.length)];
}

function makeDemoName() {
  var firstWord = ['Mario', 'Luigi', 'Peach', 'Toad', 'Toadette', 'Yoshi', 'Daisy', 
       'DonkeyKong', 'Wario', 'Bowser', 'Koopa', 'Troopa', 'Metal'];
  var secondWord1 = ['Mario', 'Luigi', 'Peach', 'Toad', 'Toadette', 'Yoshi', 'Daisy', 
       'DonkeyKong', 'Wario', 'Bowser', 'Koopa', 'Troopa', 'Metal'];

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  return firstWord[getRandomInt(0, firstWord.length)] + 
   secondWord1[getRandomInt(0, secondWord1.length)];  
}

function attemptDemoName(resolve, reject) {
  var demoName = makeDemoName();
  models.Group.findOne({
      where: {
        name: demoName
      }
    })
    .then(function (result) {
      if (result === null) {
        resolve(demoName);
      } else {
        attemptDemoName(resolve, reject);
      }
    });
}

function getUniqueDemoName() {
  var p = new Promise(function (resolve, reject) {
    attemptDemoName(resolve, reject);
  });
  return p;
}

function attemptSillyname(resolve, reject) {
  var candidateName = makeName();
  models.User.findOne({
      where: {
        username: candidateName
      }
    })
    .then(function (result) {
      if (result === null) {
        resolve(candidateName);
      } else {
        // need to try again
        attemptSillyname(resolve, reject);
      }
    });
}

function getUniqueSillyname() {
  var p = new Promise(function (resolve, reject) {
    attemptSillyname(resolve, reject);
  });
  return p;
}

function bulkCreateParticipants(num, groupId) {
  var createResults = [];
  for (var i = 0; i < num; i++) {
    createResults.push(createParticpant(groupId));
  }
  return Promise.all(createResults)
    .then(function (results) {
      return findGroupById(groupId);
    })
    .catch(function (err) {
      console.error('Err in bulk results: ', err);
    });
}

/**
 *
 */
function initSession(data) {
  // TODO: Use userid to update socketid?
  return new Promise(function (resolve, reject) {
    createSession(data.groupId)
      .then(function (session) {
        return updateGroupSession(data.groupId, session.get('id'))
          .then(function (recordsUpdated) {
            return createPrompt('Awaiting a prompt..', null, data.groupId, session.get('id'))
              .then(function (defaultPrompt) {
                resolve(defaultPrompt);
              })
              .catch(function (error) {
                console.error('Error initSession default prompt.', error);
              });
          });
      })
      .catch(function (error) {
        console.error('>> Error initiating session.', error);
      });
  });
}

function getActiveSession(groupId, socket) {
  return new Promise(function (resolve, reject) {
    findGroupById(groupId)
      .then(function (group) {
        return group.getCurrentSession()
          .then(function (session) {
            if (session === null) {
              initSession({
                  groupId: groupId
                })
                .then(function (session) {
                  resolve(session);
                });
            } else {
              resolve(group.getCurrentSession());
            }
          });
      });
  });
}

// =============================================================================
// Database Communication

function findByUsername(u) {
  return models.User.findOne({
    where: {
      username: u
    },
    include: [{
      model: models.Group,
      as: 'facilitated'
    }]
  });
}

function findByDemoGroup(groupName) {
  return models.Group.findOne({
    where: {
      name: groupName,
      demo: true
    }
  });
}

function findUserById(i) {
  return models.User.findOne({
    where: {
      id: i
    }
  });
}

function findNameByGroups(groupName, groups) {
  return groups.findOne({
    where: {
      name: groupName
    }
  });
}

// function updateUserSocketId(i, s) {
// console.log('updateUserSocketId')
// 	return models.User.update({
// 		currentSocketId: s
// 	},
// 	{
// 		where: {
// 			id: i
// 		}
// 	})
// }

function findAllGroupsByOwner(i) {
  // console.log('findAllGroupsByOwner', i)
  return models.Group.findAll({
    order: [['id', 'DESC']],
    where: {
      ownerId: i
    },
    include: [{
      model: models.User
    }]
  });
}

function findThoughts(info) {
  return models.Thought.findAll({
    where: {
      promptId: info
    },
    include: [{
      model: models.User
    }]
  });
  // return new Promise(function (resolve, reject) {
  // 	resolve(info)
  // })
}

function findAllActiveSockets(groupId) {
  return models.Socket.findAll({
    where: {
      active: true

    },
    include: [{
      model: models.User,
      where: {
        groupId: groupId
      }
    }]
  });
}

// function findPromptByAuthorAndSession (i, s) {
// 	// console.log('findPromptByAuthorAndSession', i, s)
// 	return models.Prompt.findOne({
// 		where: {
// 			userId: i,
// 			sessionId: s
// 		},
// 		include: [
// 			{ model: models.Thought }
// 		]
// 	})
// }

function findSessionThoughts(sessionId, userId) {
  return models.Thought.findAll({
    where: {
      userId: userId

    },
    include: [{
      model: models.Prompt,
      where: {
        sessionId: sessionId
      },
      // order: [['updatedAt', 'DESC']],
    }]
  });
}

function findCurrentPromptForGroup(sessionId) {
  return models.Prompt.findOne({
    order: [
      ['updatedAt', 'DESC']
    ],
    where: {
      sessionId: sessionId
    },
    include: [{
      model: models.Thought,
      where: {
        deleted: 0
      },
      required: false
    }]
  });
}

function findGroupById(i) {
  return models.Group.findOne({
    where: {
      id: i
    },
    include: [{
        model: models.User
      },
      {
        model: models.Session
      }
    ]
  });
}

function updateGroupSession(g, i) {
  return models.Group.update({
    CurrentSessionId: i
  }, {
    where: {
      id: g
    }
  });
}

function createFacilitator(e, u, p) {
  return models.User.findOne({
      where: {
        username: u
      }
    })
    .then(function (user) {
      if (user) {
        return false; // user already exists
      }
      return models.User.create({
        email: e,
        username: u,
        password: bcrypt.hashSync(p),
        role: 'facilitator'
      });
    });
}

function createGroup(n, i, k) {
  return models.Group.create({
      name: n,
      ownerId: i,
      demo: k
  });
}

function createSession(groupId) {
  return models.Session.create({
    start: new Date(),
    groupId: groupId
  });
}

function createPrompt(c, i, g, s) {
  return models.Prompt.create({
    content: c,
    userId: i,
    groupId: g,
    sessionId: s
  });
}

function createThought(c, i, p) {
  return models.Thought.create({
    content: c,
    userId: i,
    promptId: p
  });
}

function deleteThought(thoughtId) {
  return models.Thought.update({
    deleted: true
  }, {
    where: {
      id: thoughtId
    }
  });
}

function endSession(i) {
  return models.Session.update({
    end: new Date()
  }, {
    where: {
      id: i
    }
  });
}

function createParticpant(g) {
  var sillyname = makeName();
  return models.User.create({
    email: null,
    username: sillyname,
    password: null,
    role: 'participant',
    groupId: g
  });
}

function createDemoUser(userName,groupId) {
  return models.User.create({
    email: null,
    username: userName,
    password: null,
    role: 'demo',
    groupId: groupId
  })
}

function createSocket(info) {
  return models.Socket.create({
    socketioId: info.socketId,
    userId: info.userId,
    active: true
  });
}

function setSocketInactive(socketId) {
  return models.Socket.update({
    active: false
  }, {
    where: {
      socketioId: socketId
    }
  });
}

// return a promise that tells the caller when all of 
// the rooms have been left
function leaveAllRooms(socket) {
  return Promise.all(Object.keys(socket.rooms).map(function (room) {
    return socket.leaveAsync(room);
  }));
}

function findSocketByID(socketioId) {
  return models.Socket.findOne({
    where: {
      socketioId: socketioId
    },
    include: [{
      model: models.User,
      include: [{
        model: models.Group
      }]
    }]
  });
}

function createEvent(info) {
  if (!info.hasOwnProperty('socketid')) {
    info.socketid = 'unknown';
  }
  if (!info.hasOwnProperty('type')) {
    info.type = 'other';
  }

  return models.Event.create({
    type: info.type,
    data: info.data,
    socket: info.socketid
  });
}

function createDistribution(data) {
  return models.Distribution.create({
    userId: data.recipient,
    groupId: data.group,
    thoughtId: data.thought
  });
}

function getGroupColors() {
  return models.GroupColor.findAll();
}

function setDistributionColors(options) { // distId, colorId
  return models.Distribution.findById(options.distId)
    .then(function (distribution) {
      distribution.groupColorId = options.colorId;
      return distribution.save();
    });
}

// =============================================================================
// Init Server & Files
app.use('/participant/', express.static(__dirname + '/../client/index.html'));
app.use(express.static(__dirname + '/../client'));
app.use('/node_modules', express.static(__dirname + '/../node_modules'));

var PORT = process.env.PORT || 9000;

models.start()
  .then(function () {
    http.listen(PORT, function () {
      console.log('listening on *:', PORT);
    });
  })
  .catch(function (err) {
    console.error(err);
  });

// =============================================================================
// Routes for non-instant server communications

app.post('/signin', function (request, response) {
  if (!request.body.hasOwnProperty('user')) {
    response.status(400).send('Request did not contain any information.');
  } else {
    if (request.body.user.role === 'demo') {
      // find the group, error out if it doesn't exist
      findByDemoGroup(request.body.user.group)
        .then(function(group) {
          if (group != null) {
            var groupId = group.id;
            var username = request.body.user.username;
            // return createDemoUser(username, groupId);
            createDemoUser(username, groupId)
            .then(function(user) {
              response.status(200).json({
                user: user
              });
            });
          } else {
            response.status(401).send('Did not find demo group name.');
          }
        })
      // create a new user as part of that group, using a randomly generated username
      // set the user role to "demo"
      // sign in the user 
    } else {
      findByUsername(request.body.user.username)
        .then(function (user) {
          // console.log('Found ', user)
          if (user !== null) {
            if (user.role === 'facilitator') {
              if (request.body.user.username === user.username) {
                bcrypt.compare(request.body.user.password, user.password, function (err, res) {
                  if (res === true) {
                    response.status(200).json({
                      user: user
                    });
                  } else {
                    // If you get this far, user is not null, so password is wrong
                    response.status(401).send('Invalid password.');
                  }
                });
              }
            }
            if (user.role === 'participant') {
              if (request.body.user.username === user.username) {
                response.status(200).json({
                  user: user
                });
              } else {
                response.status(401).send('Invalid username');
              }
            }
          } else {
            response.status(401).send('Did not find username.');
          }
        });
      }
    }
});

app.post('/signup', function (request, response) {
  if (!request.body.hasOwnProperty('user')) {
    response.status(400).send('Request did not contain any information.');
  } else {
    createFacilitator(request.body.user.email,
        request.body.user.username,
        request.body.user.password)
      .then(function (user) {
        if (user) {
          response.status(201).json({
            user: user
          });
        } else {
          response.status(500).json({
            message: 'User with this name already exists.',
            error: 'User with this name already exists.'
          });
        }
      })
      .catch(function (err) {
        console.error('>> Error in signup: ', err);
        response.status(500).json({
          message: 'Error creating account: ' + err.errors[0].message[0].toUpperCase() + err.errors[0].message.slice(1),
          error: err
        });
      });
  }
});

app.post('/signout', function (request, response) {
  if (!request.body.hasOwnProperty('user')) {
    response.status(400).send('Request did not contain any information.');
  } else {
    findUserById(request.body.user.id)
      .then(function () {
        // TODO: Log this in the events table
        response.status(200).send('Successfully logged out.');
      })
      .catch(function (err) {
        console.error('>> Error in signout: ', err);
        response.status(500).send('Error logging out');
      });
  }
});

app.get('/groups/:userId', function (request, response) {
  if (!request.params.hasOwnProperty('userId')) {
    response.status(400).send('Request did not contain any information.');
  } else {
    findAllGroupsByOwner(request.params.userId)
      .then(function (groups) {
        // Case of null groups handled client side by requesting user to create group
        response.status(200).json({
          groups: groups
        });
      })
      .catch(function (err) {
        console.error('>> Error in get groups: ', err);
        response.status(500).send('Error finding groups');
      });
  }
});

app.post('/groups/create', function (request, response) {
  if (!request.body.hasOwnProperty('group')) {
    response.status(400).send('Request did not contain any information.');
  } else {
    findAllGroupsByOwner(request.body.group.owner)
    .then(function (groups) {
      groups.find(function(gg) {
        if (gg.name === request.body.group.name) {
          response.status(401).send('You have a group already named', request.body.group.name);
        }
      });
      createGroup(request.body.group.name,
          request.body.group.owner, false)
        .then(function (group) {
          bulkCreateParticipants(request.body.group.numParticipants,
              group.get('id'))
            .then(function (group) {
              response.status(200).json({
                group: group
              });
            });
        })
    })
    .catch(function (err) {
        console.error('>> Error in create group: ', err);
        response.status(500).send('Error creating group');
      });
  }
});

// app.delete('/groups/delete', function(request, response) {
//		//TODO: Implement ability to delete groups
// })

// =============================================================================
// Socket Communications

app.use('*', express.static(__dirname + '/../client/index.html'));

io.on('connection', function (socket) {
  var address = socket.request.connection._peername;
  // var address = socket.handshake.address;
  Promise.promisifyAll(socket);
  socket.emit('socket-id', socket.id);
  createEvent({
    type: 'connect',
    data: 'Client Connected',
    socketid: socket.id
  });

  socket.on('disconnect', function () {
    createEvent({
      type: 'disconnect',
      data: 'Client Disconnected',
      socketid: socket.id
    });
  });

  // =====================================================
  // Facilitator Specific Triggers

  /**
   * Ensures the facilitator user is only in the socket room
   * they choose and syncs the current session so they can
   * see thoughts entered before they arrived.
   * 
   * @param: INT groupId - The db id of group said facilitator wants to join
   */
  socket.on('facilitator-join', function (data) {
    leaveAllRooms(socket)
      .then(function () {
        return socket.joinAsync('discussion-' + data.groupId);
      })
      .then(function () {
        return socket.joinAsync('facilitator-' + data.groupId);
      })
      .then(function () {
        return getActiveSession(data.groupId, socket);
      })
      .then(function (session) {
        return findCurrentPromptForGroup(session.get('id'))
          .then(function (defaultPrompt) {
            getGroupColors()
              .then(function (colors) {
                socket.emit('group-colors', colors);
              });

            var room = 'discussion-' + data.groupId;
            var message = 'sessionsyncres';
            var messageData = {
              sessionId: session.get('id'),
              prompt: defaultPrompt
            };


            // why shouldn't this only talk to the socket that has just joined?
            io.to(room).emit(message, messageData);
          });

        // maybe need to bring this back eventually, but right now the 
        // distribution code uses the sockets to count who to give thoughts to
        // createSocket({
        // 	socketId: socket.id,
        // 	userId: data.userId
        // })
      });
  });

  socket.on('facilitator-leave', function (socketId) {
    setSocketInactive(socketId);
  });

  /**
   * Takes facilitator prompt and ensures it appears on all participant views.
   * 
   * @param: STRING content - user given prompt to be broadcast to participants
   */
  socket.on('new-prompt', function (data) {
    models.Session.findById(data.sessionId)
      .then(function (session) {
        session.viewingDistribution = false;
        return session.save();
      });
    createPrompt(data.prompt, data.userId, data.groupId, data.sessionId)
      .then(function (prompt) {
        io.to('discussion-' + data.groupId).emit('facilitator-prompt', prompt);
      });
  });

  // Should: load new session if one does not exist
  // send thoughts to facilitator, prompt to participants, 

  // this event ONLY comes in when the facilitator requests a new session. 
  // so it should always create a new session.
  socket.on('session-sync-req', function (data) {
    findGroupById(data.groupId)
      .then(function (group) {
        if (group.get('CurrentSessionId') !== null) {
          endSession(group.get('CurrentSessionId'));
        }
        initSession({
            groupId: data.groupId
          })
          .then(function (newPrompt) {
            io.to('discussion-' + data.groupId).emit('new-session-prompt', newPrompt);
          });
      })
      .catch(function (error) {
        console.error('>> Error syncing session:', error);
      });
  });

  /**
   * **CORE FUNCTIONALITY** 
   * Performs the heavy lifting of shuffling thoughts and handing 
   * them back to all participant users in the given group
   * 
   * @param: INT groupId - The db id of the group whose session needs distribution
   */
  socket.on('distribute', function (data) {
    // TODO:
    return Promise.all([
        models.Session.findById(data.sessionId)
          .then(function (session) {
            session.viewingDistribution = true;
            return session.save();
          }),
        findAllActiveSockets(data.groupId),
        findThoughts(data.promptId)
      ])
      .then(function (results) {
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
        // Returns a random integer between min (included) and max (excluded)
        // Using Math.round() will give you a non-uniform distribution!
        function getRandomInt(min, max) {
          return Math.floor(Math.random() * (max - min)) + min;
        }

        var activeSockets = shuffle(results[1]); // active users
        var thoughts = shuffle(results[2]);

        var thoughtsLength = thoughts.length;

        // find how many active users didn't submit thoughts, and then pad the 
        // thoughts array with those many copied thoughts
        var numCopies = activeSockets.length - thoughts.length;
        if (numCopies > 0) {
          for (var i = 0; i < numCopies; i++) {
            thoughts.push(thoughts[getRandomInt(0, thoughtsLength)]);
          }
        }


        // need to make 2 dicts:
        // 1. thought by author id
        // 2. socketid by user id

        // populating "thoughtsAuthors" array with every item in "thoughts"
        var thoughtsAuthors = [];
        thoughts.forEach(function (thought) {
          thoughtsAuthors.push(thought);
        });

        var presenters = [];
        var socketsByUId = {}; 

        activeSockets.forEach(function (connectedSocket) {
          presenters.push(connectedSocket.get('userId'));
          socketsByUId[connectedSocket.get('userId')] = connectedSocket;
        });

        // via http://stackoverflow.com/a/6274381/3850442
        function shuffle(o) {
          for (var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x)
            return o;
        }

        // TODO: is there a FIXME here? 
        // FIXME: should we do the possibleMatches in a random manner? 
        // right now i think the distribution is fairly regular and people 
        // will probably always get the same other person's thought
        function possibleMatches(thoughts, thoughtPresenters) {
          var edges = [];
          for (var i = 0; i < thoughts.length; i++) {
            for (var j = 0; j < thoughtPresenters.length; j++) {

              // checking the thought is not from the author of that thought
              if (thoughts[i].get('userId') !== thoughtPresenters[j]) {
                edges.push([i, j]);
              }
            }
          }
          // shuffle(edges)
          return edges;
        }

        // let m represent the number of connected potential readers, 
        // and let n rep the number of submitted thoughts

        // function thoughtMatcher(m, n) {
        // }

        var potentialMatches = possibleMatches(thoughtsAuthors, presenters);

        var distribution = findMatching(thoughtsAuthors.length, presenters.length, potentialMatches);

        function formatDistribution(distribution) {
          return distribution.map(function (pairing) {
            var authorOfThought = thoughtsAuthors[pairing[0]].get('userId');
            var recipientOfThought = presenters[pairing[1]];
            return recipientOfThought + ' got thought from ' + authorOfThought;
          }).join('\n');
        }

        createEvent({
          socketid: socket.id,
          data: 'groupId: ' + data.groupId + ', ' + 'promptId: ' + data.promptId + '\n' +
            'matches: ' + formatDistribution(distribution),
          type: 'distribution'
        });

        distribution.forEach(function (pairing) {
          var thoughtToSendIndex = pairing[0];
          var presenterToReceive = pairing[1];
          var presenterSocketIdx = presenters[presenterToReceive];
          var socketIdOfReceipient = socketsByUId[presenterSocketIdx].get('socketioId');
          var thoughtAuthorForSending = thoughtsAuthors[thoughtToSendIndex];
          var thoughtContent = thoughtAuthorForSending.get('content');


          createDistribution({
              recipient: presenterSocketIdx,
              thought: thoughtAuthorForSending.get('id'),
              group: thoughtAuthorForSending.get('user').get('groupId')
            })
            .then(function (newDistribution) {

              // it's possible someone has disconnected. don't friggin die if they did!
              if (typeof io.sockets.connected[socketIdOfReceipient] !== 'undefined') {
                io.sockets.connected[socketIdOfReceipient].emit('distributed-thought', {
                  id: thoughtAuthorForSending.get('id'),
                  content: thoughtContent,
                  distId: newDistribution.get('id')
                });
              }
            });
        });
      });
  });

  // =====================================================
  // Participant Specific Triggers

  /**
   * Ensures the participant user is only in the socket room
   * they belong to and syncs the current session with users
   * who join after the session begins.
   * 
   * @param: INT groupId - The db id of the group said participant belongs to
   */
  socket.on('participant-join', function (data) {

    getGroupColors()
      .then(function (colors) {
        socket.emit('group-colors', colors);
      });

    leaveAllRooms(socket)
      .then(function () {
        return socket.joinAsync('discussion-' + data.groupId);
      })
      .then(function () {
        return socket.joinAsync('participant-' + data.groupId);
      })
      .then(function () {
        getActiveSession(data.groupId, socket)
          .then(function (session) {
            // End last session?

            // get current prompt
            findCurrentPromptForGroup(session.get('id'))
              .then(function (defaultPrompt) {
                var room = 'discussion-' + data.groupId;
                var message = 'sessionsyncres';
                var messageData = {
                  sessionId: session.get('id'),
                  prompt: defaultPrompt
                };

                // i'm late (or refreshed?) and my class is already viewing 
                // distributed thoughts, 
                if (session.viewingDistribution) {
                  // look for a distribution for me,
                  models.Distribution.findOne({
                      where: {
                        userId: data.userId
                      },
                      include: {
                        model: models.Thought,
                        where: {
                          promptId: defaultPrompt.id
                        }
                      }
                    })
                    .then(function (dist) {
                      if (dist) {
                        socket.emit('distributed-thought', {
                          id: dist.thoughtId,
                          content: dist.thought.content,
                          distId: dist.id,
                          agrees: dist.agrees
                        });
                      } else {
                        // if it's not found, create one!
                        models.sequelize.query('select thoughts.* from ' +
                          'thoughts where thoughts.promptId=:promptId and ' +
                          'thoughts.userId<>:userId and thoughts.id not in ' +
                          '(select distributions.thoughtId from distributions ' +
                          'join thoughts on distributions.thoughtId=thoughts.id ' +
                          'where thoughts.promptId=:promptId)', {
                            replacements: {
                              promptId: defaultPrompt.id,
                              userId: data.userId
                            },
                            type: models.sequelize.QueryTypes.SELECT
                          }).then(function (unusedThoughtIds) {
                          if (unusedThoughtIds && unusedThoughtIds.length > 0) {
                            return createDistribution({
                                recipient: data.userId,
                                thought: unusedThoughtIds[0].id,
                                group: data.groupId
                              })
                              .then(function (newDistribution) {
                                socket.emit('distributed-thought', {
                                  id: unusedThoughtIds[0].id,
                                  content: unusedThoughtIds[0].content,
                                  distId: newDistribution.get('id')
                                });
                              });
                          } else {
                            // all thoughts are distributed, just pick one that's not mine
                            return models.Thought.findOne({
                              where: {
                                promptId: defaultPrompt.id,
                                userId: {
                                  $ne: data.userId
                                }
                              }
                            }).then(function (thoughtToDist) {
                              return createDistribution({
                                  recipient: data.userId,
                                  thought: thoughtToDist.id,
                                  group: data.groupId
                                })
                                .then(function (newDistribution) {
                                  socket.emit('distributed-thought', {
                                    id: thoughtToDist.id,
                                    content: thoughtToDist.content,
                                    distId: newDistribution.get('id')
                                  });
                                });
                            });
                          }
                        });
                      }
                    });
                }

                // setTimeout(function () {
                // socket.broadcast.to(room).emit(message, messageData)
                io.to(room).emit(message, messageData);
                io.to('facilitator-' + data.groupId).emit('participant-join');
                // }, 2000)
              });

            // findSessionThoughts(session.get('id'), data.userId)
            // 	.then(function(prevThoughts) {
            // 		// maybe don't do this bc it could harm anonymity?
            // 		// socket.emit('previous-thoughts', prevThoughts)
            // 	})

            return createSocket({
              socketId: socket.id,
              userId: data.userId
            });
          })
          .catch(function (error) {
            console.error('Error in participant join', error);
          });
      });
  });

  socket.on('participant-leave', function (data) {
    // TODO: market Socket Obj inactive
    findSocketByID(data)
      .then(function (socket) {
        if (socket && socket.get('user') && socket.get('user').get('group') &&
          socket.get('user').get('group').get('id')) {

          io.to('facilitator-' + socket.get('user').get('group')
            .get('id')).emit('participant-leave');
        }
      });
    setSocketInactive(data);
  });

  /**
   * Takes participant thought and ensures it appears on the facilitator's view.
   * 
   * @param: STRING content - user-given thought to be broadcast to facilitator
   */
  socket.on('new-thought', function (newThought) {
    createThought(newThought.content, newThought.author.id, newThought.promptId)
      .then(function (thought) {
        socket.broadcast.to('facilitator-' + newThought.author.groupId)
          .emit('participant-thought', thought);
      })
      .catch(function (error) {
        console.error('>> Error on new thought:', error);
      });
  });

  socket.on('choose-group', function (chosenInfo) {
    // chosenInfo has keys: thoughtId, thoughtGroupId, groupId
    // get the groupID for this class
    // then
    if (chosenInfo.hasOwnProperty('thoughtId') &&
      chosenInfo.hasOwnProperty('distId') &&
      chosenInfo.hasOwnProperty('thoughtGroupId') &&
      chosenInfo.hasOwnProperty('groupId') &&
      chosenInfo.hasOwnProperty('presenter')) {
      setDistributionColors({ // distId, colorId
        distId: chosenInfo.distId,
        colorId: chosenInfo.thoughtGroupId
      });
      socket.broadcast.to('facilitator-' + chosenInfo.groupId)
        .emit('group-chosen', chosenInfo);
    }
  });

  socket.on('fac-delete-thought', function (data) {
    deleteThought(data.thoughtId);
  });

  socket.on('log', function (info) {
    info.socketid = socket.id;
    createEvent(info);
  });

  socket.on('add-demo-group', function (ownerId) {
    getUniqueDemoName()
      .then(function (uniqueDemoName) {
        createGroup(uniqueDemoName,
          ownerId, true)
        .then(function (newDemoGroup) {
          socket.emit('added-new-demo-group', newDemoGroup);
        });
      });
  });

  socket.on('add-person', function (group) {
    getUniqueSillyname()
      .then(function (uniqueSillyName) {
        return models.Group.findById(group.id)
          .then(function (dbGroup) {
            dbGroup.addPersonWithName(uniqueSillyName)
              .then(function (newUser) {
                socket.emit('added-new-person', newUser);
              });
          });
      });
  });

  function setAgreement(id, agrees) {
    return models.Distribution.findById(id)
      .then(function (dist) {
        dist.setAgreement(agrees);
      });
  }

  socket.on('agree', function (distributedThought) {
    setAgreement(distributedThought.distId, true);
  });

  socket.on('disagree', function (distributedThought) {
    setAgreement(distributedThought.distId, false);
  });

  // Audio functionality
  socket.on('new-audio-stream', function(stream) {
    console.log('Group ID: ' + stream.groupId + '\t' + 
      'Session ID: ' + stream.sessionId + '\t' +
      'Volume: ' + stream.volumeValue);
  });
});

