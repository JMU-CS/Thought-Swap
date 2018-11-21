(function () {
    'use strict';

    angular.module('app')
        .controller('GroupManagerController', GroupManagerController);

    GroupManagerController.$inject = ['$scope', 'UserService', '$location', '$uibModal', 'ThoughtSocket'];

    function GroupManagerController($scope, UserService, $location, $modal, ThoughtSocket) {

        (function initController() {
            $scope.dataLoading = true;

            UserService.getGroups()
                .then(function (groups) {
                    $scope.groups = groups;
                    if ($scope.groups.length > 0) {
                        $scope.groups.map(function (item) {
                            item.isOpen = false;
                        });
                        $scope.groups[0].isOpen = true;
                    }
                })
                .catch(function (err) {
                    console.log('Error loading groups', err)
                    // TODO: notify user
                })
                .finally(function () {
                    $scope.dataLoading = false;
                });

        })();

        $scope.userService = UserService;

        $scope.createDemoGroup = function () {
            var modalInstance = $modal.open({
                animation: true,
                templateUrl: 'app/facilitator/partials/newDemoGroupModal.html',
                controller: 'NewGroupModalController',
                resolve: {
                    groups: function () {
                        return $scope.groups;
                    }
                }
            });

            modalInstance.result.then(function (group) {
                $scope.groups.unshift(group);
            });
        };

        $scope.createGroup = function () {
            var modalInstance = $modal.open({
                animation: true,
                templateUrl: 'app/facilitator/partials/newGroupModal.html',
                controller: 'NewGroupModalController',
                resolve: {
                    groups: function () {
                        return $scope.groups;
                    }
                }
            });

            modalInstance.result.then(function (group) {
                $scope.groups.unshift(group);
            });
        };

        $scope.logOut = function () {
            $scope.dataLoading = true;
            UserService.logout()
                .then(function (user) {
                    $location.path('/login/facilitator');
                })
                .catch(function (err) {
                    console.log('Error logging out', err);
                    $scope.dataLoading = false;
                });
        };

        $scope.expand = function (idx) {
            if (idx !== 0)
                $scope.groups[idx].isOpen = !$scope.groups[idx].isOpen;
        };

        $scope.nav = function ($event) {
            // console.log(groupId, $event);
            $event.stopPropagation();
        };

        // $scope.addDemoGroup = function (event) {
        //     event.stopPropagation();
        //     event.preventDefault();
        //     ThoughtSocket.emit('add-demo-group', UserService.user.id);
        // }

        $scope.addPerson = function (group, event) {
            console.log('add person');
            console.log(group);
            console.log(event);
            event.stopPropagation();
            event.preventDefault();
            ThoughtSocket.emit('add-person', group);
        };

        // ThoughtSocket.on('added-new-demo-group', function (newDemoGroup) {
        //     $scope.groups.unshift(newDemoGroup);
        // })

        ThoughtSocket.on('added-new-person', function (newParticipant) {
            console.log('added-new-person', newParticipant);
            $scope.groups.filter(function (group) {
                return group.id === newParticipant.groupId;
            })[0].users.unshift(newParticipant);
        });
    } // End GroupManagerController


    /**
     * @ngdoc The controller for the modal that handles new group input.
     * @name NewGroupModal
     * @description
     * # From Docs: Please note that $modalInstance represents a modal 
     *   window (instance) dependency. It is not the same as the $modal
     *   service used above. 
     * # Included within this controller file because it
     *   is tightly related to the above controller
     */
    angular.module('app')
        .controller('NewGroupModalController', NewGroupModalController);

    NewGroupModalController.$inject = ['$scope', '$uibModalInstance', 'groups', 'GroupsService', 'UserService'];

    function NewGroupModalController($scope, $modalInstance, groups, GroupsService, UserService) {
        $scope.groups = groups;

        $scope.submitDemo = function () {
            GroupsService.createDemoGroup({
                    groupname: $scope.groupname,
                    ownerId: UserService.user.id,
                    numParticipants: $scope.numParticipants
                })
                .then(function (results) {
                    $modalInstance.close(results.group);
                })
                .catch(function (err) {
                    $scope.error = err;
                });
        };

        $scope.submit = function () {
            GroupsService.createGroup({
                    groupname: $scope.groupname,
                    ownerId: UserService.user.id,
                    numParticipants: $scope.numParticipants
                })
                .then(function (results) {
                    $modalInstance.close(results.group);
                })
                .catch(function (err) {
                    $scope.error = err;
                });
        };

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };
    }

})();