// ==UserScript==
  //@author      msgobs jewe11
  //@description A JavaScript modification for the Canvas learning management system which adds the ability to message the observers of students on the Inbox and Gradebook/Marksbook pages.
  //@name        Message Observers
  //@require     http://code.jquery.com/jquery-1.7.2.min.js
  //@namespace   msObs
  //@include     https://uview.test.instructure.com/*
  //@include     https://uview.instructure.com/*
  //@version     vAlpha
  //@grant       none
// ==/UserScript==

let msObs = {
  options: {
    colour: "bisque", // colour for observers. Use any HTML colour like '#FF0000' or 'red'
    observersText: "Include Observers", // include observers button text.
    removeText: "Remove Students", //  remove students button text.
    busyText: "Working...", // text to display while observers are being processed.
    btnWidth: "110px",
    autoTickIndividualMsgCheckbox: true,
    log: false // output log in the browser console.
  },

  init: () => {
    // init for conversations page (inbox) or gradebook page
    if (
      window.location.href.indexOf("/conversations") !== -1 &&
      this.conversations
    ) {
      msObs.log("Launching Conversations");
      this.launch("conversations");
    } else if (
      window.location.href.indexOf("/gradebook") !== -1 &&
      this.gradebook
    ) {
      msObs.log("Launching Gradebook");
      this.launch("gbook");
    }
  },

  launch: type => {
    this.common.init();

    switch (type) {
      case "conversations":
        this.conversations.init();
        break;
      case "gbook":
        this.gradebook.init();
        break;
    }
  },

  common: {
    els: {
      flashMessage: $("#flash_message_holder") // Canvas message flasher (appears top center of screen-ish).
    },
    txt: {
      noStudents: "There are no students in the recipient list.",
      noStudentsRmv: "There are no students in the recipient list.",
      addObsSuccess: "Observers added successfully.",
      addObsNone: "No observers were found.",
      removedStudents: "Removed students.",
      noRecipients: "There are no recipients in the addressee field.",
      noContext:
        "Notice: You have not selected a course context for your search. The observer lookup may take some time and will include observer matches from <strong>all courses.</strong>",
      noContextRmv:
        "Notice: You have not selected a course context for your search. The removal lookup will remove recipients who have a student enrolment in <strong>any course.</strong>",
      noNewObservers:
        "The recipient list already included all matched observers.",
      groupExpansion:
        "Your recipient list contains groups. Groups will be expanded into their respective members."
    },

    init: () => {
      // create button objects with classes from default Canvas buttons. May need classes updated in the future.
      this.btnAddObs = $("<div>" + msObs.options.observersText + "</div>")
        .addClass(
          "ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only"
        )
        .css({
          margin: "0 2px",
          "min-width": msObs.options.btnWidth
        });
      this.btnRmvStu = $("<div>" + msObs.options.removeText + "</div>")
        .addClass(
          "ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only"
        )
        .css({
          margin: "0 2px",
          "min-width": msObs.options.btnWidth
        });
    },

    getCsrfToken: () => {
      // returns secret cookie token
      let csrfToken = document.cookie.slice(
        document.cookie.indexOf("_csrf_token=") + 12
      );
      if (csrfToken.indexOf(";") !== -1) {
        // depending on the order of the cookie lets the csrf may be at end of string. Therefore, there will be no semicolon. Chrome.
        csrfToken = csrfToken.slice(0, csrfToken.indexOf(";"));
      }
      return csrfToken;
    },

    searchObjArray: (arr, search) => {
      let match = -1;
      arr.forEach((item, i) => {
        for (let key in item) {
          if (item[key] === search) {
            match = i;
          }
        }
      });
      return match; // for consistency with indexOf comparisons
    },

    getEnrolmentsRecursively: {
      Enrolments: (callback, resultsObj) => {
        this.complete = callback;
        this.recursiveResults = [];
        this.resultsObj = resultsObj;
      },

      init: (options, callback, results) => {
        let enrolments = new this.Enrolments(callback, results);
        let operator = options.query.indexOf("?") !== -1 ? "&" : "?";
        msObs.xhr.get(
          "/api/v1/" +
            options.mode +
            "/" +
            options.id +
            "/" +
            options.query +
            operator +
            "per_page=100" +
            options.type,
          this.proc,
          enrolments
        );
      },

      proc: (res, status, enrolments, link) => {
        let ctx = msObs.common.getEnrolmentsRecursively;

        if (res.forEach) {
          res.forEach(v => {
            enrolments.recursiveResults.push(v);
          });
        } else {
          enrolments.recursiveResults.push(res);
        }

        if (link && link.indexOf("next") !== -1) {
          // is there a next page?
          let next = ctx.parseNextLink(link); // get the next link
          msObs.xhr.get(next, ctx.proc, enrolments); // get the next page
        } else {
          enrolments.complete(
            enrolments.recursiveResults,
            status,
            enrolments.resultsObj
          );
        }
      },

      parseNextLink: link => {
        link = link.match(/,<.*>;.rel="next"/);
        link = link[0].match(/<.*>/);
        link = link[0].replace(/<|>/g, "");
        return link;
      }
    },

    getObservers: {
      init: (recipients, context, callback) => {
        msObs.log("--Observers 2.0--");

        let Observers = () => {
          this.contexts = [context];
          this.contexts.count = 0;
          this.contexts.total = 0;
          this.contexts.getCount = 0;
          this.expand = [];
          this.expand.count = 0;
          this.expand.total = 0;
          this.users = [];
          this.users.simplified = [];
          this.enrolments = [];
          this.observers = [];
          this.callback = callback;
          this.matchFlag = 0;
        };

        let results = new Observers();

        this.sortRecipients(recipients, results);
        this.process.init(results);
      },

      sortRecipients(recipients, results) {
        recipients.forEach(id => {
          id = id.split("_");

          switch (id.length) {
            case 1:
              // user id
              results.expand.push(["user", id[0]]);
              break;
            case 2:
              // course, section
              results.expand.push([id[0], id[1]]);
              break;
            case 3:
              // course, section, type
              results.expand.push([id[0], id[1], id[2]]);
              break;
          }
        });
      },

      process: {
        init: results => {
          msObs.log(results);
          this.expand(results);
          results.expand.total = results.expand.length;
        },

        handle: (data, status, results) => {
          results.expand.count++;
          if (data.forEach) {
            data.forEach(v => {
              if (v.user) {
                results.users.push(v.user);
              } else {
                results.users.push(v);
              }
            });
          } else {
            results.users.push(data);
          }

          msObs.log(
            "Expand count: " +
              results.expand.count +
              " Total: " +
              results.users.length
          );

          if (results.expand.count === results.expand.total) {
            results.users.forEach(v => {
              results.users.simplified.push({
                id: v.id,
                name: v.name
              });
            });
            msObs.common.getObservers.process.lookup.init(results);
          }
        },

        expand: results => {
          let callback = this.handle;
          results.expand.forEach(v => {
            let type = "";

            if (v[2]) {
              type = v[2].slice(0, v[2].length - 1); // remove plural
              type = "&enrollment_type=" + type;
            }

            // at some point this will need to be made per user
            let options = false;

            switch (v[0]) {
              case "user":
                if (results.contexts[0] === "none") {
                  options = {
                    mode: "users",
                    id: v[1],
                    query: "",
                    type: ""
                  };
                } else {
                  options = {
                    mode: "courses",
                    id: results.contexts[0],
                    query: "search_users?search_term=" + v[1],
                    type: ""
                  };
                }
                break;
              case "course":
                options = {
                  mode: "courses",
                  id: v[1],
                  query: "users",
                  type: type
                };
                break;
              case "section":
                options = {
                  mode: "sections",
                  id: v[1],
                  query: "enrollments",
                  type: ""
                };
                break;
              case "group":
                options = {
                  mode: "groups",
                  id: v[1],
                  query: "users",
                  type: ""
                };
                break;
            }
            msObs.common.getEnrolmentsRecursively.init(
              options,
              callback,
              results
            );
          });
        },

        lookup: {
          init: results => {
            msObs.log("--- Getting Enrollments ---");
            results.contexts.total = results.contexts.length;
            if (results.contexts[0] === "none") {
              results.contexts.pop();
              this.getContexts.init(results);
            } else {
              this.enrolments(results);
            }
          },

          getContexts: {
            init: results => {
              msObs.log(
                "No context for lookup, getting contexts from user enrolments."
              );
              results.contexts.getCount = 0;
              this.contexts(results);
            },

            contexts: results => {
              let callback = this.handle;
              results.users.forEach(v => {
                let options = {
                  mode: "users",
                  id: v.id,
                  query: "enrollments?state=active",
                  type: ""
                };
                msObs.common.getEnrolmentsRecursively.init(
                  options,
                  callback,
                  results
                );
              });
            },

            handle: (data, status, results) => {
              results.contexts.getCount++;
              data.forEach(v => {
                if (results.contexts.indexOf(v.course_id) === -1) {
                  // don't make duplicates
                  results.contexts.push(v.course_id);
                }
              });
              msObs.log(
                "getContextCount: " +
                  results.contexts.getCount +
                  " Total: " +
                  results.users.length
              );
              if (results.contexts.getCount === results.users.length) {
                msObs.log("Context lookup complete.");
                msObs.common.getObservers.process.lookup.init(results);
              }
            }
          },

          enrolments: results => {
            let callback = this.handle;
            results.contexts.forEach(v => {
              let options = {
                mode: "courses",
                id: v,
                query: "enrollments",
                type: ""
              };
              msObs.common.getEnrolmentsRecursively.init(
                options,
                callback,
                results
              );
            });
          },

          handle: (data, status, results) => {
            results.contexts.count++;
            data.forEach(v => {
              if (v.associated_user_id) {
                results.enrolments.push(v);
              }
            });

            msObs.log(
              "Enrolments Count: " +
                results.contexts.count +
                "Total: " +
                results.contexts.total
            );

            if (results.contexts.count === results.contexts.total) {
              msObs.log("Completed enrolments lookup");
              msObs.common.getObservers.process.match.init(results);
            }
          }
        },

        match: {
          init: results => {
            msObs.log("--- Matching Results ---");
            this.match(results);
          },

          match: results => {
            results.users.forEach(user => {
              results.enrolments.forEach(enrolment => {
                msObs.log(
                  "Comparing: " +
                    user.id +
                    " <-> " +
                    enrolment.associated_user_id
                );
                if (user.id === enrolment.associated_user_id) {
                  msObs.log("Found a match.");
                  results.matchFlag = 1;
                  let observerData = {
                    id: enrolment.user_id,
                    name: enrolment.user.name,
                    observing: user.name
                  };
                  // omit duplicate entries, add additional observees to existing entry.
                  let observerDuplicate = msObs.common.searchObjArray(
                    results.observers,
                    observerData.id
                  );

                  // below is a probably pointless check
                  // let userDuplicate = msObs.common.searchObjArray(results.users.simplified, user.id);
                  let userObserverDuplicate = msObs.common.searchObjArray(
                    results.users.simplified,
                    observerData.id
                  );
                  if (
                    observerDuplicate === -1 &&
                    userObserverDuplicate === -1
                  ) {
                    results.observers.push(observerData);
                  } else if (observerDuplicate > -1) {
                    if (
                      results.observers[observerDuplicate].observing.indexOf(
                        user.name
                      ) === -1
                    ) {
                      results.observers[observerDuplicate].observing +=
                        ", " + user.name;
                    }
                  }
                }
              });
            });

            msObs.common.getObservers.complete(results);
          }
        }
      },
      complete: results => {
        // maybe return the whole object, eh?
        results.callback([
          results.observers,
          results.users.simplified,
          results.matchFlag
        ]);
      }
    },

    // old lookup methods below. Still used in gradebook lookups.
    getEnrolments: (id, mode, returnCallback) => {
      let CollatedEnrolments = () => {
        this.total = id.length;
        this.count = 0;
        this.enrolments = [];
      };

      let collatedEnrolments = new CollatedEnrolments();

      let callback = data => {
        // add each result to enrolments result object
        collatedEnrolments.enrolments.push(data);
        collatedEnrolments.count++;
        if (collatedEnrolments.count >= collatedEnrolments.total) {
          // oncomplete, call callback function.
          let enrolments = [];
          collatedEnrolments.enrolments.forEach(v => {
            enrolments = enrolments.concat(v);
          });
          returnCallback(enrolments);
        }
      };

      if (id.forEach) {
        id.forEach(v => {
          let options = {
            mode: mode,
            id: v,
            query: "enrollments",
            type: ""
          };

          msObs.common.getEnrolmentsRecursively.init(options, callback);
        });
      }
    },

    getCourseSections: (courseId, callback) => {
      let handle = data => {
        let sections = [];
        data.forEach(v => {
          if (sections.indexOf(v.id) === -1) {
            sections.push(v.id);
          }
        });
        callback(sections);
      };
      msObs.xhr.get(
        "/api/v1/courses/" + courseId + "/sections?per_page=100000",
        handle
      );
    },

    getMatchedObservers: (ids, enrolments) => {
      // returns associated_users given an array of ids (of students)
      let observerIds = [];
      let inserted = [];
      enrolments.forEach(enrolment => {
        // act on observers with associated_user_id specified
        if (
          enrolment.type === "ObserverEnrollment" &&
          enrolment.associated_user_id !== null
        ) {
          ids.forEach(v => {
            // compare with given id list
            if (enrolment.associated_user_id == v.id) {
              let observerData = {
                id: enrolment.user_id,
                name: enrolment.user.name,
                observing: v.name
              };
              // omit duplicate entries, add additional observees to existing entry.
              let duplicate = inserted.indexOf(observerData.id);
              if (duplicate === -1) {
                observerIds.push(observerData);
                inserted.push(observerData.id);
              } else {
                if (observerIds[duplicate].observing.indexOf(v.name) === -1) {
                  observerIds[duplicate].observing += ", " + v.name;
                }
              }
            }
          });
        }
      });

      return observerIds;
    },

    notify: (msg, type) => {
      let time = new Date();
      time = time.getMilliseconds();
      let msgSuccess = $(
        '<li id="msObs-notification-' +
          time +
          '" class="ic-flash-' +
          type +
          '" aria-hidden="true" style="z-index: 2; margin-top: 7px;"><div class="ic-flash__icon"><i class="icon"></i></div>' +
          msg +
          '<button type="button" class="Button Button--icon-action close_link"><i class="icon-x"></i></button></li>'
      );
      this.els.flashMessage.append(msgSuccess);
      // remove the message after a 5 secs.
      setTimeout(() => {
        $("#msObs-notification-" + time).fadeOut(() => {
          $(this).remove();
        });
      }, 5000);
    }
  },

  conversations: {
    runOnce: 0,
    step: 0,
    els: {
      dialog: ".compose-message-dialog",
      btnContainer: ".attachments",
      courseId: "input[name=context_code]",
      recipientList: ".ac-token-list",
      recipientEl: ".ac-token"
    },
    init: () => {
      let ctx = this;
      // set bindings for buttons
      let messagebox = document.getElementsByTagName("body");
      msObs.common.btnAddObs.bind("click", () => {
        msObs.conversations.getObserversInit();
      });

      msObs.common.btnRmvStu.bind("click", () => {
        msObs.conversations.removeStudentsInit();
      });

      // Some elements are loaded dynamaically after the page load. Loop to test
      // whether they're there yet. Previously used a mutationobserver.

      let readyCheck = callback => {
        if ($(msObs.conversations.els.dialog).length) {
          msObs.log(msObs.conversations.els.dialog + " found.");
          msObs.conversations.insertUi();
        } else {
          msObs.log(msObs.conversations.els.dialog + " element not ready.");
          setTimeout(() => {
            callback(callback);
          }, 500);
        }
      };
      readyCheck(readyCheck);
    },

    insertUi: () => {
      if (
        window.ENV.current_user_roles.indexOf("teacher") !== -1 ||
        window.ENV.current_user_roles.indexOf("admin") !== -1
      ) {
        $(this.els.btnContainer, this.els.dialog).append(
          msObs.common.btnAddObs,
          msObs.common.btnRmvStu
        );
        msObs.log("Teacher/Admin role detected. UI inserted.");
      } else {
        msObs.log("No teacher/admin role detected.");
        msObs.log(window.ENV.current_user_roles);
      }

      this.autoCheck();
    },

    autoCheck: () => {
      // check the tickbox for individual messages.
      if (msObs.options.autoTickIndividualMsgCheckbox) {
        $("#compose-btn").on("click", () => {
          setTimeout(() => {
            if ($("#bulk_message").length) {
              $("#bulk_message").prop("checked", true);
            } else {
              msObs.conversations.autoCheck();
            }
          }, 50);
        });
      }
    },

    setMode: () => {
      this.courseID = $(this.els.courseId, this.dialog).attr("value");
      if (this.courseID.indexOf("course_") !== -1) {
        this.courseID = this.courseID.replace("course_", "");
        this.mode = "course";
      } else {
        this.mode = "user";
      }
      msObs.log("Mode: " + this.mode);
      msObs.log("Course_ID: " + this.CourseID);
    },

    getObserversInit: () => {
      msObs.log("Getting Observers Init..");
      this.step = 0;
      this.mode = "";

      let recipients = this.getRecipientIds();
      if (!recipients.length) {
        msObs.common.notify(msObs.common.txt.noRecipients, "warning");
      } else {
        this.setMode(); // set whether a course context has been selected
        this.getObservers(); // start!
      }
    },

    getObservers: data => {
      this.step++;
      msObs.log("-----------------");
      msObs.log("GetObservers Mode: [" + this.mode + "] Step: " + this.step);

      let callback = function getObservers(data) {
        msObs.log("Returning to original Caller..");
        msObs.conversations.getObservers(data);
      };

      let recipients = [];
      this.getRecipientIds().forEach(v => {
        recipients.push(v.id);
      });

      switch (this.step) {
        case 1:
          let context;
          if (this.mode === "user") {
            context = "none";
            msObs.common.notify(msObs.common.txt.noContext, "success");
          } else {
            context = this.courseID;
          }

          let hasGroups = 0;
          recipients.forEach(v => {
            if (
              v.indexOf("course") !== -1 ||
              v.indexOf("group") !== -1 ||
              v.indexOf("section") !== -1
            ) {
              hasGroups = 1;
            }
          });

          if (hasGroups) {
            msObs.common.notify(msObs.common.txt.groupExpansion, "success");
          }

          msObs.common.btnAddObs
            .addClass("disabled")
            .text(msObs.options.busyText);
          msObs.common.btnRmvStu.addClass("disabled");
          msObs.common.getObservers.init(recipients, context, callback);

          break;
        case 2:
          let observers = data[0];
          let users = data[1];
          let matchFlag = data[2];
          msObs.log(observers);
          // complete!
          if (observers.length || users.length) {
            msObs.conversations.clear(observers.concat(users));
            users.forEach(v => {
              msObs.conversations.insert(v, false);
            });
            observers.forEach(v => {
              msObs.conversations.insert(v, true);
            });

            if (users.length && !observers.length && matchFlag) {
              msObs.common.notify(msObs.common.txt.noNewObservers, "success");
            }

            if (users.length && !observers.length && !matchFlag) {
              msObs.common.notify(msObs.common.txt.addObsNone, "warning");
              msObs.log("No observers found");
            }

            if (observers.length) {
              msObs.common.notify(msObs.common.txt.addObsSuccess, "success");
            }
            msObs.log("Inserted results.");
          } else {
            msObs.common.notify(msObs.common.txt.addObsNone, "warning");
            msObs.log("No observers found");
          }
          msObs.common.btnRmvStu.removeClass("disabled");
          msObs.common.btnAddObs
            .removeClass("disabled")
            .text(msObs.options.observersText);
          break;
      }
    },

    getRecipientIds: () => {
      // return recipients from list element
      let recipients = [];
      $(this.els.recipientEl, this.els.dialog).each((index, obj) => {
        recipients.push({
          id: $("input", obj).attr("value"),
          name: $(obj).text()
        });
      });
      return recipients;
    },

    clear: arr => {
      $(this.els.recipientList, this.els.dialog).empty();
    },

    insert: (user, observer) => {
      // add a list item, might need to update these classes occasionally.
      if (observer) {
        let obj = $(
          '<li class="ac-token" title="Linked to: ' +
            user.observing +
            '" data-type="observer" style="background-color:' +
            msObs.options.colour +
            '; border-color: rgba(0,0,0,0.10);">' +
            user.name +
            '<a href="#" class="ac-token-remove-btn"><i class="icon-x icon-messageRecipient--cancel"></i><span class="screenreader-only">Remove recipient ' +
            user.name +
            '</span></a><input name="recipients[]" value="' +
            user.id +
            '" type="hidden"></li>'
        );
      } else {
        let obj = $(
          '<li class="ac-token" data-type="user" style="border-color: rgba(0,0,0,0.10);">' +
            user.name +
            '<a href="#" class="ac-token-remove-btn"><i class="icon-x icon-messageRecipient--cancel"></i><span class="screenreader-only">Remove recipient ' +
            user.name +
            '</span></a><input name="recipients[]" value="' +
            user.id +
            '" type="hidden"></li>'
        );
      }
      $(this.els.recipientList, this.els.dialog).append(obj);
    },

    removeStudentsInit: () => {
      // remove students. Unfortunately also needs an api lookup since user roles
      // don't appear to be associated with list items.
      msObs.log("Removing Students");
      this.removeStep = 0;
      this.setMode();
      this.removeStudents();
    },

    removeStudents: data => {
      let ctx = this;
      this.removeStep++;
      msObs.log("------------------------");
      msObs.log(
        "Remove Students Mode: [" + this.mode + "] Step: " + this.removeStep
      );

      let callback = result => {
        msObs.conversations.removeStudents(result);
      };

      let recipients, removal;

      switch (this.mode) {
        case "user":
          switch (this.removeStep) {
            case 1:
              msObs.common.notify(msObs.common.txt.noContextRmv, "success");
              // look up user enrolments.
              if (this.getRecipientIds().length) {
                msObs.common.btnAddObs.addClass("disabled");
                msObs.common.btnRmvStu
                  .addClass("disabled")
                  .text(msObs.options.busyText);
                recipients = this.getRecipientIds();
                let ids = [];
                recipients.forEach(v => {
                  ids.push(v.id);
                });
                msObs.log("Getting Enrolments for users.");
                msObs.common.getEnrolments(ids, "users", callback);
              } else {
                msObs.common.notify(msObs.common.txt.noStudentsRmv, "warning");
              }
              break;
            case 2:
              // process for enrolment type.
              msObs.log("User Enrolments:");
              msObs.log(data);
              recipients = this.getRecipientIds();
              msObs.log("Recipient IDs:");
              msObs.log(recipients);

              // Where users have a students enrolmentType, queue for removal
              removal = [];
              recipients.forEach(v => {
                let enrolmentType = ctx.getEnrolmentStatus(v.id, data);
                if (enrolmentType.indexOf("StudentEnrollment") !== -1) {
                  removal.push(v.id);
                }
              });
              // remove matched StudentEnrollment ids.
              msObs.log("Matched StudentEnrollment removal IDs:");
              msObs.log(removal);
              this.removeById(removal);
              msObs.common.btnRmvStu
                .removeClass("disabled")
                .text(msObs.options.removeText);
              msObs.common.btnAddObs.removeClass("disabled");
              break;
          }
          break;
        case "course":
          switch (this.removeStep) {
            case 1:
              // lookup course enrolments.
              if (this.getRecipientIds().length) {
                msObs.common.btnRmvStu
                  .addClass("disabled")
                  .text(msObs.options.busyText);
                msObs.common.btnAddObs.addClass("disabled");
                msObs.log("Getting Enrolments for users.");
                msObs.common.getEnrolments(
                  [this.courseID],
                  "courses",
                  callback
                );
              } else {
                msObs.common.notify(msObs.common.txt.noStudentsRmv, "warning");
              }
              // now that I look at this, I think it's missing sections. Probably should fix that soon.
              break;
            case 2:
              msObs.log("Course Enrolments: ");
              msObs.log(data);
              this.courseEnrolments = data;
              msObs.log("Getting course sections:");
              msObs.common.getCourseSections(this.courseID, callback);
              break;
            case 3:
              msObs.log("Course Sections: ");
              msObs.log(data);
              msObs.common.getEnrolments(data, "sections", callback);
              break;
            case 4:
              enrolments = this.courseEnrolments.concat(data);

              msObs.log("All Enrolments: ");
              msObs.log(data);
              recipients = this.getRecipientIds();
              removal = [];
              recipients.forEach(v => {
                let enrolmentType = ctx.getEnrolmentStatus(v.id, enrolments);
                if (enrolmentType.indexOf("StudentEnrollment") !== -1) {
                  removal.push(v.id);
                }
              });
              msObs.log("Matched StudentEnrollment removal IDs:");
              msObs.log(removal);
              this.removeById(removal);
              msObs.common.btnRmvStu
                .removeClass("disabled")
                .text(msObs.options.removeText);
              msObs.common.btnAddObs.removeClass("disabled");
              break;
          }
          break;
      }
    },

    removeById: removal => {
      // remove ids from list element given an array of ids.
      let removed = false;
      $(this.els.recipientEl, this.els.dialog).each((index, obj) => {
        let id = $("input", obj).attr("value");
        if (removal.indexOf(id) !== -1) {
          $(this).remove();
          removed = true;
        }
      });

      if (removed) {
        msObs.common.notify(msObs.common.txt.removedStudents, "success");
      } else {
        msObs.common.notify(msObs.common.txt.noStudentsRmv, "warning");
      }
    },

    getEnrolmentStatus: (user, enrolments) => {
      let type = [];
      enrolments.forEach(v => {
        if (v.user_id == user) {
          type.push(v.type);
        }
      });
      return type;
    }
  },

  gradebook: {
    messageSent: false,
    step: 0,
    runOnce: 0,
    els: {
      gradetable: document.getElementById("gradebook-grid-wrapper"), // container for grades, monitored for mutations
      dialog: "#message_students_dialog", // container for message box
      bodyClassCoursePrefix: "context-course_", // prefix for course context code found in body class
      btnContainer: $(".button-container", "#message_students_dialog"), // msgbox button container
      inputMessageTypes: $(".message_types", "#message_students_dialog"), // student criteria dropdown
      inputScoreCutoff: $(".cutoff_holder", "#message_students_dialog"), // when score criteria is selected, input for no. val appears
      inputFormFields: $(
        ".cutoff_holder, #subject, #body",
        "#message_students_dialog"
      ), // all form fields (for validation)
      inputSubject: $("#subject"), // msg subject field
      inputBody: $("#body"), // msg body field
      btnCanvasSend: $(
        ".button-container .send_button",
        "#message_students_dialog"
      ), // default canvas send button
      btnmsObsSend: $(
        '<div type="submit" class="Button Button--primary send_button disabled msObs_sender" aria-disabled="true">Send Message</div>'
      ), // replacement button with alternate send action
      btnCanvasClose: ".ui-dialog-titlebar-close", // close button for msgbox
      studentList: $(".student_list", "#message_students_dialog"),
      studentClass: ".student" // class for student list items.
    },

    init: () => {
      msObs.common.btnAddObs
        .bind("click", () => {
          msObs.gradebook.getObserversInit();
        })
        .css("float", "left");
      msObs.common.btnRmvStu
        .bind("click", () => {
          msObs.gradebook.removeStudents();
        })
        .css("float", "left");

      let courseId = $("body").attr("class");
      courseId = courseId.slice(
        courseId.indexOf(this.els.bodyClassCoursePrefix) +
          this.els.bodyClassCoursePrefix.length
      );
      courseId = courseId.slice(0, courseId.indexOf(" "));
      this.courseId = courseId;

      msObs.log("Course ID: " + this.courseId);

      // check to see if element is ready for modification.
      let readyCheck = callback => {
        if ($(msObs.gradebook.els.dialog).length) {
          msObs.log(msObs.gradebook.els.dialog + " found.");
          msObs.gradebook.els.dialog = $(msObs.gradebook.els.dialog);
          msObs.gradebook.insertUi();
        } else {
          msObs.log(msObs.gradebook.els.dialog + " element not ready.");
          setTimeout(() => {
            callback(callback);
          }, 500);
        }
      };

      readyCheck(readyCheck);
    },

    insertUi: () => {
      if (msObs.gradebook.runOnce === 0) {
        msObs.gradebook.runOnce = 1;

        // Action setup
        msObs.gradebook.els.btnContainer.prepend(
          msObs.common.btnAddObs,
          msObs.common.btnRmvStu
        );

        msObs.gradebook.els.inputMessageTypes.change(() => {
          msObs.gradebook.removeObservers();
        });

        msObs.gradebook.els.inputScoreCutoff.bind("keyup", () => {
          msObs.gradebook.removeObservers();
        });

        msObs.gradebook.els.inputFormFields.bind("keyup", () => {
          msObs.gradebook.validate();
        });

        msObs.gradebook.els.btnmsObsSend.bind("click", () => {
          msObs.gradebook.submit();
        });
        msObs.log("UI Inserted.");
      }
    },

    getObserversInit: () => {
      msObs.log("--------------------");
      msObs.log("Getting Observers...");
      this.step = 0;
      this.getObservers();
    },

    getObservers: data => {
      this.step++;
      msObs.log("--------------------");
      msObs.log("Gradebook Step: " + msObs.gradebook.step);

      let callback = result => {
        msObs.gradebook.getObservers(result);
      };

      switch (this.step) {
        case 1:
          this.removeObservers(); // cleanup previously inserted observers

          // swap buttons to prevent Canvas actions on send click.
          msObs.gradebook.els.btnCanvasSend.remove();
          msObs.gradebook.els.btnContainer.append(
            msObs.gradebook.els.btnmsObsSend
          );
          msObs.common.btnAddObs
            .addClass("disabled")
            .text(msObs.options.busyText);
          msObs.common.btnRmvStu.addClass("disabled");
          if (!this.getStudentList().length) {
            //  no studetns
            msObs.common.notify(msObs.common.txt.noStudents, "warning");
            msObs.common.btnAddObs
              .removeClass("disabled")
              .text(msObs.options.observersText);
          } else {
            // Get course enrolments.
            msObs.log("Course: " + this.courseId);
            msObs.common.getEnrolments([this.courseId], "courses", callback);
          }
          break;
        case 2:
          // store result of enrolments, get sections of present course.
          msObs.log("Course Enrolments: ");
          msObs.log(data);
          // finalise the process

          // concanentate earlier course enrolments with section enrolments.
          let courseEnrolments = data;
          // match student names to ids. Vulnerable to identical names.
          let studentIds = this.getStudentIds(
            this.getStudentList(),
            courseEnrolments
          );
          msObs.log("Student IDs: ");
          msObs.log(studentIds);
          // Match user's observing ids to student ids
          let observerIds = msObs.common.getMatchedObservers(
            studentIds,
            courseEnrolments
          );
          msObs.log("Matched observers: ");
          msObs.log(observerIds);
          // insert the tokens to the ui, complete process with feedback.
          this.insert(observerIds);
          msObs.common.btnAddObs
            .removeClass("disabled")
            .text(msObs.options.observersText);
          msObs.common.btnRmvStu.removeClass("disabled");
          msObs.common.notify(msObs.common.txt.addObsSuccess, "success");
          break;
      }
    },

    getStudentList: () => {
      // return list of student names from recipient list element.
      let namelist = [];
      let students = $(
        msObs.gradebook.els.studentClass,
        msObs.gradebook.els.studentList
      );
      students.each(() => {
        if (
          $(this)
            .attr("style")
            .indexOf("list-item") >= 0
        ) {
          namelist.push({
            name: $(".name", $(this)).text(),
            obj: this
          });
        }
      });
      return namelist;
    },

    getStudentIds: (studentNames, enrolments) => {
      // returns student ids from students names matched with ids found in enrolment data
      let ids = [];
      studentNames.forEach(studentName => {
        enrolments.forEach((enrolment, i) => {
          if (enrolment.user.name == studentName.name) {
            ids.push({
              id: enrolment.user.id,
              name: studentName.name
            });
            $(studentName.obj).attr("data-id", enrolment.user.id);
          }
        });
      });
      return ids;
    },

    insert: list => {
      // insert elements into ui.
      list.forEach(v => {
        let item = $(
          '<li class="parent" data-id="' +
            v.id +
            '" title="Observing: ' +
            v.observing +
            '" style="display: list-item; background-color: ' +
            msObs.options.colour +
            '; border-color: rgba(0,0,0,0.10);"><span class="name">' +
            v.name +
            '</span><div class="remove-button Button Button--icon-action" title="Remove ' +
            v.name +
            ' from recipients" aria-disabled="false"><i class="icon-x"></i></div></li>'
        );
        $(".remove-button", item).click(() => {
          $(this)
            .parent()
            .remove();
        });
        msObs.gradebook.els.studentList.append(item);
      });

      this.validate();
    },

    validate: () => {
      // check message readiness and update button state.
      let subject = msObs.gradebook.els.inputSubject.val();
      let body = msObs.gradebook.els.inputBody.val();
      let recipients = 0;
      $("li", msObs.gradebook.els.studentList).each(() => {
        if (
          $(this)
            .attr("style")
            .indexOf("list-item") !== -1
        ) {
          recipients++;
        }
      });

      if (
        subject.length > 0 &&
        body.length > 0 &&
        recipients > 0 &&
        this.messageSent === false
      ) {
        msObs.gradebook.els.btnmsObsSend.removeClass("disabled");
      } else {
        msObs.gradebook.els.btnmsObsSend.addClass("disabled");
      }
    },

    getRecipients: () => {
      // return list of recipient items from student list element.
      let recipients = [];
      $("li", msObs.gradebook.els.studentList).each(() => {
        el = $(this);
        // if the item is displayed, it should be part of the message recipients.
        if (el.attr("style").indexOf("list-item") !== -1) {
          recipients.push(el.attr("data-id"));
        }
      });
      return recipients;
    },

    submit: () => {
      msObs.log("Sending Message...");
      // send the message
      if (this.messageSent === true) {
        return false;
      }

      // Build mega data string. Couldn't get sending JSON object to work :(
      let data = "utf8=%E2%9C%93"; // odd tick character
      data += "&authenticity_token=" + msObs.common.getCsrfToken();
      data +=
        "&recipients=" + encodeURIComponent(this.getRecipients().toString(","));
      data += "&group_conversation=true";
      data += "&bulk_message=true";
      data += "&context_code=course_" + this.courseId;
      data += "&mode=async";
      data +=
        "&subject=" +
        encodeURIComponent(msObs.gradebook.els.inputSubject.val());
      data +=
        "&body=" + encodeURIComponent(msObs.gradebook.els.inputBody.val());
      data += "&_method=post";

      msObs.log("Data: " + data);

      // oncomplete function
      let callback = (res, status) => {
        msObs.gradebook.cleanup(true);
        msObs.gradebook.messageSent = false;
        $(msObs.gradebook.els.btnCanvasClose).click();
        msObs.log("XHR Status " + status);
        if (status == "202" || status == "200") {
          msObs.common.notify("Message sent!", "success");
        } else {
          msObs.common.notify(
            "An error occured. Your message was not sent.",
            "error"
          );
          alert(
            "An error occured and your message was not sent. Please copy your message below to prevent losing your beautifully crafted dialog!\n\n" +
              msObs.gradebook.els.inputBody.val()
          );
        }
      };

      msObs.xhr.post("/api/v1/conversations", data, callback);
      this.messageSent = true;
      this.validate();
    },

    cleanup: silent => {
      msObs.log("Cleaning up: ");
      this.removeStudents(silent);
      this.removeObservers();
    },

    removeObservers: () => {
      $(".parent", this.els.studentList).remove();
      // put the normal button back because we're not messaging parents anymore.
      msObs.gradebook.els.btnmsObsSend.detach();
      msObs.gradebook.els.btnContainer.append(
        msObs.gradebook.els.btnCanvasSend
      );
      msObs.log("Observers removed");
    },

    removeStudents: silent => {
      msObs.log("Students removed");
      let failed = 1;
      $(".student", msObs.gradebook.els.dialog).each(() => {
        if (
          $(this)
            .attr("style")
            .indexOf("display: list-item") >= 0
        ) {
          failed = 0;
        }
      });
      if (failed === 1) {
        if (!silent) {
          msObs.common.notify(msObs.common.txt.noStudentsRmv, "warning");
        }
      } else {
        $(".student", msObs.gradebook.els.dialog).attr(
          "style",
          "display: none;"
        );
        if (!silent) {
          msObs.common.notify(msObs.common.txt.removedStudents, "success");
        }
      }
    }
  },

  xhr: {
    // xhr stuff. pretty generic
    get: (url, callback, ref) => {
      let req = new XMLHttpRequest();
      msObs.log("XHR: Url: " + url);
      let handle = () => {
        let res = this.responseText;
        res = JSON.parse(res.replace("while(1);", ""));
        msObs.log("XHR: Response: ");
        msObs.log(res);
        callback(res, this.status, ref, this.getResponseHeader("Link"));
      };

      req.onload = handle;
      req.open("GET", url);
      req.send();
    },

    post: (url, data, callback) => {
      let req = new XMLHttpRequest();

      let handle = () => {
        let res = this.responseText;
        let status = this.status;
        res = JSON.parse(res.replace("while(1);", ""));
        callback(res, status);
      };

      req.onload = handle;
      req.open("POST", url, true);
      req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      req.send(data);
    }
  },

  logItems: [],
  log: (msg, warn, err) => {
    let date = new Date();

    let zero = str => {
      return str.toString().length < 2 ? "0" + str : str;
    }; // derp. no idea how to use dates.

    stamp =
      "[" +
      zero(date.getHours()) +
      ":" +
      zero(date.getMinutes()) +
      ":" +
      zero(date.getSeconds()) +
      "] ";
    if (msObs.options.log) {
      console.log(stamp + JSON.stringify(msg));
    }
    this.logItems.push(stamp + JSON.stringify(msg));
  },
  applog: () => {
    console.dir(logitems);
  }
};

$(document).ready(() => {
  msObs.init();
});
