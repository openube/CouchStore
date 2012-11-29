function runActivity(couchapp) {
    // return true if running in the Zombie.js test harness
    var isZombie = /Zombie.js/.test(navigator.userAgent);

    // Make a new function for running _update handlers
    // Adapted from jquery.couch.js code
    if (! couchapp.update) {
        function toJSON(obj) {
            return obj !== null ? JSON.stringify(obj) : null;
        }
        function encodeOptions(options) {
            // Convert an object into form data
            var buf = [];
            if (typeof(options) === "object" && options !== null) {
                for (var name in options) {
                    if ($.inArray(name, ["error", "success", "beforeSuccess", "akaxStart"]) >= 0)
                        continue;
                    var value = options[name];
                    if ($.inArray(name, ["key", "startkey", "endkey"]) >= 0) {
                        value = toJSON(value);
                    }
                    buf.push(encodeURIComponent(name) + "=" + encodeURIComponent(value));
                }
            }
            return buf.length ? "?" + buf.join("&") : "";
        }
        couchapp.update = function(name, data, options) {
            var docid = data._id ? data._id : null;
            var options = options || {};
            var type = 'POST';
            var url = '/' + this.db.name + '/' + this.design.doc_id + '/_update/' + name + encodeOptions(options);

            if (docid) {
                type = 'PUT';
                url = url + '/' + docid;
                delete data._id;
            }
            delete data._rev;

            $.ajax( $.extend({  type: type,
                                url: url,
                                async: true,
                                dataType: 'json',
                                data: data,
                                contentType: 'application/x-www-form-urlencoded',
                            }, options));
        };
        // list() has a bug where the success, error methods don't get passed down to
        // the ultimate ajax () call
        couchapp.list = function(list, view, options) {
            options = options || {};
            var type = 'GET';
            var data = null;
            var url = this.db.uri + '/' + this.design.doc_id + '/_list/' + list + '/' + view + encodeOptions(options);
            if (options['keys']) {
                type = 'POST';
                var keys = options['keys'];
                delete options['keys'];
                data = JSON.stringify({ keys: keys });
            }
            $.ajax( $.extend({
                url: url,
                type: type,
                async: true,
                dataType: 'json'
                }, options));
        }
    };

    function fade(elt, delay, then) {
        delay = delay === undefined ? 5000 : delay;
        if (isZombie) {
            window.setTimeout(function() {
                then();
            });
        } else {
            elt.animate({ opacity: 0},
                        5000,
                        then);
        }
    }

    var showNotification = function(type, message) {
        // Type can be error, warning, success, info
        var alertClass = 'alert-' + type,
            notification = $('#inline-notification');

        notification
            .empty()
            .addClass(alertClass)
            .append(message)
            .show();

            fade(notification, 5000, function() {
                        notification.removeClass(alertClass);
                        notification.hide();
                });
    };

    var loggedInUser = false;

    var account = $.sammy('#account', function() {
        var account = this;

        this.use('Template');

        this.bind('run', function(context) {
            this.init();
        });

        this.helpers( {
            isLoggedIn: function() {
                return !! loggedInUser;
            },
            doWithUser: function(callback) {
                callback(loggedInUser);
            },
            init: function(callback) {
                $.couch.session({
                    success: function(session) {
                        if (session.userCtx && session.userCtx.name) {
                            var prevName = loggedInUser.name;
                            loggedInUser = session.userCtx;
                            if (! loggedInUser || (loggedInUser.name != prevName)) {
                                // changed from loggout out to logged in, or switched user
                                account.trigger('loggedIn');
                            }
                            if (callback) {
                                callback(loggedInUser);
                            }
                        } else {
                            account.trigger('loggedOut');
                        }
                    }
                });
            },
            doWithValidUser: function(callback, force) {
                var user = this;
                if (!this.loggedInUser || force) {
                    this.init(callback);
                } else {
                    if (callback) {
                        callback(logegdInUser);
                    }
                }
            },
            login: function(name, password) {
                var context = this;
                $.couch.login({
                    name: name,
                    password: password,
                    success: function(s) {
                        context.doWithValidUser(function() { account.trigger('loggedIn') }, true );
                    },
                    error: function(code, error, reason) {
                        account.trigger('loggedOut');
                        showNotification('error', reason);
                    }
                });
            },
            logout: function() {
                var user = this;
                $.couch.logout({
                    success: function() {
                        user.logegdInUser = false;
                        account.trigger('loggedOut');
                    },
                    error: function(code, error, reason) {
                        showNotification('error', reason);
                    }
                });
            },
            signup: function(name, password) {
                var user = this;
                $.couch.signup({name: name}, password, {
                    success: function() {
                        this.login(name, password);
                    },
                    error: function() {
                        showNotification('error', reason);
                    }
                });
            }
        });  // end helpers

        this.notFound = function() { };

        this.get('#/', function(context) { });

        this.get('#/login', function(context) {
            context.render('templates/account-loginForm.template')
                    .swap(function() {
                            context.$element('input').first().focus();
                            context.$element('button#cancel').click(function() { context.trigger('loggedOut')})
                          });
                    
        });
        this.post('#/login', function(context) {
            this.login(context.params['name'], context.params['password']);
        });
        this.bind('loggedIn', function(context) {
            this.render('templates/account-loggedIn.template', {user: loggedInUser}).swap();
            activity.trigger('loggedIn');
            this.redirect('#/');
        });

        this.get('#/signup', function(context) {
            context.render('templates/account-signupForm.template')
                    .swap(function() {
                            context.$element('input').first().focus();
                            context.$element('button#cancel').click(function() { context.trigger('loggedOut')})
                          });
        });
        this.post('#/signup', function(context) {
            this.signup(context.params['name'], context.params['password']);
        });

        this.get('#/logout', function(context) {
            this.logout();
        });
        this.bind('loggedOut', function(context) {
            this.render('templates/account-loggedOut.template').swap();
            activity.trigger('loggedOut');
            this.redirect('#/');
        });

        account.run('#/');
    });


    var activity = $.sammy('#activity', function() {
        var activity = this;

        activity.notFound = function() { };

        this.use('Template');
        this.use('Title');

        var Money = couchapp.require('views/lib/money');
        var currentOrderWidget;

        this.helpers({
            showNotification: showNotification,

            showNav: function() {
                $('#navbar .logged-in-menu').show();
            },

            hideNav: function() {
                $('#navbar .logged-in-menu').hide();
            },

            deactivateOrderWidget: function() {
                if (currentOrderWidget) {
                    currentOrderWidget.deactivate();
                    currentOrderWidget = null;
                }
            },

            editItemModal: function(type, item_id) {
                var show_q = '_show/edit-' + type,
                    d = jQuery.Deferred(),
                    context = this;
                if (item_id) {
                    show_q += '/' + item_id;
                }
                $.get(show_q)
                    .then(function(content) {
                        var content = $(content),
                            orderTable = $('#order-display'),
                            modal;

                        modal = content.appendTo(context.$element())
                                           .modal({backdrop: true, keyboard: true, show: true});
                        modal.on('shown', function() { modal.find('input:text:first').focus() });
                        modal.on('hidden',
                                function() {
                                    modal.remove();
                                    d.resolve(modal);
                                });
                    });
                return d.promise();
            },

            errorModal: function(title, message) {
                var d = $.Deferred();
                var modal = $.mustache(couchapp.ddoc.templates['error-modal'],
                                            { title: 'Barcode', message: message });
                modal = $(modal).appendTo(this.$element())
                                .modal({backdrop: true, keyboard: true, show: true});
                modal.on('hidden', function() { modal.remove(); d.resolve(true) });
                return d.promise();
            },

            dialogModal: function(title, message) {
                var d = $.Deferred();
                var modal = $.mustache(couchapp.ddoc.templates['dialog-modal'],
                                            { title: title, message: message });
                modal = $(modal).appendTo(this.$element())
                                .modal({backdrop: true, keyboard: true, show: true});
                modal.on('hidden', function() { modal.remove(); d.resolve(true) });
                return d.promise();
            },

            newdialogModal: function(title, message, buttons) {
                var d = $.Deferred(),
                    answer,
                    firstButton = ((!buttons) || (buttons.length == 0)) ? 'Ok' : buttons.shift(),
                    modal, elt,
                    data = { title: title, firstButton: firstButton, buttons: buttons };

                if (typeof(message) == 'object') {
                    elt = message;   // This seems cheesy....
                } else {
                    data.message = message;
                }

                modal = $.mustache(couchapp.ddoc.templates['newdialog-modal'], data);
                modal = $(modal).appendTo(this.$element())
                                .modal({backdrop: true, keyboard: true, show: true});
                if (elt) {
                    modal.find('div.modal-body').append(elt);
                }
                modal.find('form').submit(function() {
                    answer = firstButton
                    modal.modal('hide');
                    return false;
                })
                .click(function(e) {
                    var elt = $(e.srcElement);
                    if (elt.is('button')) {
                        answer = elt.attr('value');
                        modal.modal('hide');
                        return false;
                    }
                });
                modal.find('a.follow').click(function(e) {
                    modal.modal('hide');
                    return true;
                });
                modal.on('hidden', function() { modal.remove(); d.resolve(answer) });
                return d.promise();
            },
 

            fixupOrderWarehouseSelect: function(warehouseList, selectedWarehouseName) {
                // The order show functions don't have access to all the warehouse docs, and
                // the select input is empty.  After we get the order's HTML, we need to fill
                // in the warehouse select
                var html = '',
                    warehouseSelect = $('select.warehouse-picker');

                $.each(warehouseList, function(idx, warehouse) {
                    html += '<option value="' + warehouse.value + '">' + warehouse.value + '</option>';
                });
                warehouseSelect.append(html);

                if (typeof(selectedWarehouseId) === 'Array') {
                    selectedWarehouseName.forEach(function(warehouseName, idx) {
                        warehouseName && warehouseName.done(
                            function(warehouseName) {
                                warehouseSelect.get(idx).val(warehouseName);
                            }
                        );
                    });
                } else {
                    selectedWarehouseName && selectedWarehouseName.done(
                        function(warehouseNames) {
                            var setSelect = function(warehouseName, idx) {
                                $(warehouseSelect.get(idx)).val(warehouseName);
                            };
                            if ($.isArray(warehouseNames)) {
                                warehouseNames.forEach(setSelect);
                            } else {
                                setSelect(warehouseNames, 0);
                            }
                        }
                    );
                }
            },

            // This updates the price/cost of all items in the order
            updateOrdersItems: function(orderDoc) {
                var update_method = orderDoc['order-type'] === 'receive' ? 'item-cost-cents' : 'item-price-cents',
                    items_to_update = {},
                    context = this,
                    d = $.Deferred();

                if ('_rev' in orderDoc) {
                    // Don't update item costs/prices when editing an exiting order
                    d.resolve();
                } else if (orderDoc['order-type'] === 'warehouse-transfer') {
                    // transfer orders don't have price/cost
                    d.resolve();
                } else {
                    // Go through the items list and update the cost/price of them
                    if ('items' in orderDoc) {
                        $.each(orderDoc['items'], function(barcode, quan) {
                            items_to_update[barcode] = quan;
                        });
                    }
                    couchapp.view('items-by-barcode', {
                        keys: Object.keys(items_to_update),
                        success: function(data) {
                            var i = 0,
                                barcode,
                                docid,
                                waitingOn = data.rows.length;

                            d.progress(function() {
                                if (--waitingOn === 0 ) {
                                    d.resolve();
                                }
                            });

                            for (i = 0; i < data.rows.length; i++) {
                                barcode = data.rows[i].key;
                                docid = data.rows[i].id;
                                couchapp.update( update_method, { _id: docid, v: orderDoc['item-costs'][barcode] }, {
                                    success: function() {
                                        d.notify();
                                    },
                                    error: function(status, reason, message) {
                                        var itemName = orderDoc['item-names'][barcode];
                                        context.showNotification(
                                                'error',
                                                'Problem updating ' + cost_price_key + ' for item ' + itemName + ': ' + message);
                                        d.reject();
                                    }
                                });
                            }
                        }
                    });
                }
                return d.promise();
            },

            // Today's date as a string
            todayAsString: function() {
                var now = new Date,
                    month = now.getMonth() + 1,
                    dateStr = now.getFullYear() + '-'
                            + (month < 10 ? '0' : '') + month + '-'
                            + (now.getDate() < 10 ? '0' : '') + now.getDate();
                return dateStr;
            },

            // Find the last box ID used and return the next one
            getNextBoxId: function() {
                var d = $.Deferred();

                couchapp.view('shipment-box-ids', {
                    descending: true,
                    startkey: [this.todayAsString(), ''],
                    limit: 1,
                    success: function(data) {
                        var boxID = data.rows.length ? (data.rows[0].key[1] + 1) : 1;
                        d.resolve(boxID);
                    }
                });
                return d.promise();
            },

            // Wire up the show-obsolete check box in the item lister and inventory report
            toggleObsolete: function() {
                $('input#show-obsolete').click(function(e) {
                    var rows = $('tr.obsolete');
                    if (e.target.checked) {
                        rows.show();
                    } else {
                        rows.hide();
                    }
                });
            },

        });

        function getWarehouseList () {
            var d = $.Deferred();
            couchapp.view('warehouses-by-priority', {
                success: function(data) {
                    d.resolve(data.rows);
                },
                error: function() {
                    d.reject();
                },
            });
            return d.promise();
        }

//        this.around({ except: /#\/(login|signup)/ }, function(callback) {
//            var context = this;
//            if (User.isLoggedIn()) {
//                callback();
//            } else {
//                this.trigger('loggedOut');
//            }
//            return false;
//        });

        this.bind('run', function() { 

        });

        this.bind('loggedIn', function(e) {
            var context = this;
            var account_context = new account.context_prototype();
            account_context.doWithUser(function(user) {
                if (user) {
                    context.showNav();
                } else {
                    context.hideNav();
                }
            });
        });

        this.bind('loggedOut', function(context) {
            this.$element().empty();
            this.hideNav();
            showNotification('info','Logged Out');
        });

        this.before({ except: /#\/(login|signup)/ }, function() {

            //User.doWithValidUser(this.showNav);
        });

        this.get('#/', function(context) {
            context.deactivateOrderWidget();
            context.$element().empty();
        });

        // When called without an order-number, it presents a list of shipments without tracking
        // numbers for the user to pick from.  The form re-get()s this same URL with the
        // order-number and shipment as a param
        this.get('#/confirm-shipment/', function(context) {
            context.deactivateOrderWidget();
            if (! ('shipment-id' in context.params)) {
                // No shipment, show the list of shipments to pick form
                var list_q = '_list/confirm-shipment-order-picker/unconfirmed-shipments';
                context.$element().load(list_q);

            } else {
                // Show the confirm-shipment entry form

                // shipment_id is composite of shipment-orderNumber
                var shipment_id = context.params['shipment-id'],
                    shipment    = shipment_id.substr(0, shipment_id.indexOf('-')),
                    orderNumber = shipment_id.substr(shipment_id.indexOf('-') + 1),
                    show_q      = '_show/confirm-shipment/order-' + orderNumber;

                context.$element().load(show_q + '?shipment='+encodeURIComponent(shipment));
            }

        });

        this.post('#/confirm-shipment/:orderNumber/:shipment', function(context) {
            var params = context.params,
                cost = Money.toCents(params['shipping-cost']),
                docid = 'order-'+params.orderNumber;

            couchapp.update('confirm-shipment', {   _id: docid,
                                                    s: params.shipment,
                                                    'tracking-number': params['tracking-number'],
                                                    'shipping-cost': cost,
                                                    'weight': params.weight,
                                                    'size':  params.size },
                        {
                            success: function() {
                                showNotification('success', 'Shipment confirmed');
                                context.redirect('#/confirm-shipment/');
                            },
                            error: function(status, reason, message) {
                                showNotification('error', 'Could not confirm shipment: ' + message);
                            }
                        });
        });

        // When called without an order-number, it presents a list of sale orders with unshipped items
        // to the user to pick from.  The form re-get()s this same URL with the order-number as a
        // param.
        this.get('#/shipment/', function(context) {
            context.deactivateOrderWidget();
            if (! ('order-number' in context.params)) {
                // No order-number, show the list of orders to pick from

                var list_q = '_list/shipment-order-picker/shipment-order-picker';
                $.get(list_q, function(content) {
                    context.$element().html(content);
                    // The loaded page has scripts we need to start up
                    // that match the test box and select list
                    context.$element().find('script').each( function(i) {
                        eval($(this).text());
                    });
                });
            } else {
                // Presents a sale order to the user and allows them to select unshipped items to send
                // out in this shipment
                var orderNumber = context.params['order-number'],
                    orderId = 'order-' + orderNumber,
                    show_q = '_show/shipment/'+orderId+'?date='+context.todayAsString();
            
                $.get(show_q)
                    .done(function(content) {
                        context.$element().html(content);
                        ShipmentWidget({
                            couchapp: couchapp,
                            context: context,
                            activity: activity
                        });
                    })
                    .fail(function(resp,  status, reason) {
                        message = $.parseJSON(resp.responseText).reason;
                        showNotification('error', 'Could not generate shipment for order ' + orderNumber + ': ' + message);
                    });
            }
        });

        // Called to edit a previously defined shipment
        this.get('#/edit/shipment/:orderId/:shipmentId', function(context) {
            context.deactivateOrderWidget();
            var show_q = '_show/shipment/' + context.params.orderId;
            context.$element()
                .load(show_q + '?shipment=' + encodeURIComponent(context.params.shipmentId),
                    function() {
                        ShipmentWidget({
                            couchapp: couchapp,
                            context: context,
                            activity: activity
                        });
                    }
                );

        });

        this.get('#/delete/shipment/:orderId/:shipment', function(context) {
            context.deactivateOrderWidget();
            var docid = context.params.orderId,
                orderNumber = docid.substr(6),
                shipment = context.params.shipment;

            var message = 'Are you sure you want to delete shipment '
                               + shipment + ' from order ' + orderNumber;
            var answer = context.newdialogModal('Delete Shipment',
                                                    message,
                                                    ['Ok', 'Cancel']);
            answer.done(function(answer) {
                if (answer == 'Ok') {
                    couchapp.update('delete-shipment', { _id: docid, s: shipment }, {
                        success: function() {
                            showNotification('success', 'Shipment deleted');
                        },
                        error: function(status, reason, message) {
                            showNotification('error', 'Could not delete shipment: '+message);
                        }
                    });
                }
            });
            answer.always(function() {
                window.history.back();
            });
        });

        // called when a shipment form is submitted to define a shipment
        this.post('#/shipment/', function(context) {
            var orderId = 'order-' + context.params['order-number'],
                params = $.extend({ _id: orderId, s: context.params['shipment'] }, context.params);

            delete params['order-number'];
            delete params['shipment'];

            context.getNextBoxId()
                .then( function(boxID) {
                    params.box = boxID;
                    couchapp.update('shipment', params, {
                        success: function() {
                            context.dialogModal('Shipment saved', 'Shipment for order ' + orderId
                                                + ' is box ' + boxID)
                                .then(function() {
                                    showNotification('success', 'Shipment saved');
                                    context.redirect('#/shipment/');
                                });
                        },
                        error: function(status, reason, message) {
                                showNotification('error', 'Could not save shipment: ' + message);
                        }
                    });
                });
        });

        // Presents a form to the user to start an inventory correction
        this.get('#/edit/inventory/(.*)', function(context) {
            context.deactivateOrderWidget();
            var inv_id = context.params['splat'][0],
                show_q = '_show/partial-inventory';

            if (inv_id) {
                show_q += '/' + inv_id;
            }
            show_q = show_q + '?date='+context.todayAsString();
            function runOrderWidget() {
                getWarehouseList().then( context.fixupOrderWarehouseSelect );
                new InventoryWidget({   couchapp: couchapp,
                                    context: context,
                                    activity: activity,
                            });
            }

            context.$element().load(show_q, runOrderWidget);
        });

        // Submit a partial inventory correction
        this.post('#/edit/inventory/(.*)', function(context) {
            var params = context.params.toHash(),
                docId = context.params['splat'][0] || context.params['_id'] || '',
                section = context.params.section,
                next_url = '#/'

            couchapp.update('partial-inventory/'+docId, params, {
                success: function(orderDoc) {
                    context.showNotification('success', 'Inventory for section ' + orderDoc.section + ' saved!');
                    activity.trigger('inventory-updated', orderDoc);
                    context.$element().empty();
                    context.redirect(next_url);
                },
               error: function(status, reason, message) {
                    $.log('Problem saving inventory for section  '+ section +"\nmessage: " + message + "\nstatus: " + status + "\nreason: "+reason);
                    context.showNotification('error' , 'Problem saving inventory for section ' + section + ': ' + message);
                }
            });
        });

        // Used to apply the accumulated partial physical inventories into one "order" per
        // warehouse that will make the item counts correct
        this.get('#/inventory-commit/', function(context) {
            context.deactivateOrderWidget();
            var content = $.mustache(couchapp.ddoc.templates['confirm-inventory-corrections'],
                                    { action: '#/inventory-commit/' },
                                    couchapp.ddoc.templates.partials);
            context.$element().html(content);
            context.$element('div#corrections')
                    .load('_list/proposed-inventory-correction/inventory-by-permanent-warehouse-barcode?group=true');
        });

        this.post('#/inventory-commit/', function(context) {
            var todaysDate = context.todayAsString(),
                remove_on_error = [],  // In case of problems, remove these already-saved corrections
                done = jQuery.Deferred();

            couchapp.list('proposed-inventory-correction', 'inventory-by-permanent-warehouse-barcode', {
                group: true,
                success: processRows,
                error: function(status, reason, message) {
                    done.reject('Cannot get inventory correnctions: '+message);
                }
            });

            done.done(function() {
                showNotification('success', 'Inventory changes applied successfully');
                context.redirect('#/');
            });
            done.fail(function(message) {
                remove_on_error.forEach(function(orderDoc) {
                    couchapp.db.removeDoc(orderDoc);
                });
                showNotification('error', message);
            });

            function processRows(warehouses) {
                var warehouse, barcode, updateParams,
                    warehouseCount = 0;

                for (warehouse in warehouses) {
                    warehouseCount++;
                }

                // FIXME - we could probably move this conversion code into the list
                for (warehouse in warehouses) {
                    updateParams = {
                        _id: 'order-' + warehouse + '-inv-' + todaysDate,
                            date: todaysDate,
                            'warehouse-name': warehouse,
                            'customer-name': loggedInUser.name,
                        };
                    for (barcode in warehouses[warehouse]) {
                        thisItem = warehouses[warehouse][barcode];
                        updateParams['scan-'+barcode+'-quan'] = thisItem.count;
                        updateParams['scan-'+barcode+'-sku']  = thisItem.sku;
                        updateParams['scan-'+barcode+'-name'] = thisItem.name;
                    }
                    (function(warehouse) {
                        couchapp.update('inventory-correction', updateParams, {
                            success: function(doc) {
                                remove_on_error.push(doc);
                                if (--warehouseCount === 0) {
                                    removePartialInventories();
                                }
                            },
                            error: function(status, reason, message) {
                                done.reject('Cannot save inventory correction for '+warehouse+': '+message);
                            }
                        });
                    })(warehouse);
                }
            } // end processRows

            var left_to_delete = -1;
            function removePartialInventories() {
                couchapp.db.allDocs({
                    startkey: 'inv-',
                    endkey: 'inv-\u9999',
                    success: function(data) {
                        left_to_delete = data.rows.length;
                        data.rows.forEach(removeThisPartialInventory);
                    },
                    error: function(status, reason, message) {
                        done.reject('Cannot get list of partial inventories: '+message);
                    }
                });
            }

            function removeThisPartialInventory(row) {
                var remove = { _id: row.id, _rev: row.value.rev };
                couchapp.db.removeDoc(remove, {
                    success: function() {
                        if (--left_to_delete === 0) {
                            done.resolve();
                        }
                    },
                    error: function(status, reason, message) {
                        done.reject('Cannot remove partial inventory doc '+row.id);
                    }
                });
            }
        });

        // Presents a form to the user to edit an already existing order
        this.get('#/edit/order/(.*)', function(context) {
            context.deactivateOrderWidget();
            var order_id = context.params['splat'][0],
                show_q = '_show/edit-order';

            if (order_id) {
                show_q += '/' + order_id;
            }

            $.get(show_q)
                .then(function(content) {
                    context.$element().html(content);

                    // We still need to fixup the warehouse
                    var d = $.Deferred();
                    couchapp.db.openDoc(order_id, {
                        success: function(doc) {
                            if (doc['order-type'] === 'warehouse-transfer') {
                                d.resolve([ doc['source-warehouse-name'], doc['warehouse-name']]);
                            } else {
                                d.resolve(doc['warehouse-name']);
                            }
                        }
                    });
                    getWarehouseList().then( function(warehouseList) { context.fixupOrderWarehouseSelect(warehouseList, d.promise()) } );
                    currentOrderWidget = new OrderWidget({
                                                couchapp: couchapp,
                                                context: context,
                                                activity: activity
                                        });
                });
        });

        // This presents a form to the user to create some kind of order
        // order_type is either receive or sale
        // The form posts to #/order/receive below VVV
        this.get('#/create-order/:order_type/', function(context) {
            context.deactivateOrderWidget();
            var order_type = context.params.order_type,
                show_q = '_show/edit-order/?type=' + order_type + '&date='+context.todayAsString();

            $.get(show_q)
                .then(function(content) {
                    context.$element().html(content);

                    // Still need to supply today's date and fix up the warehouse select
                    getWarehouseList().then( context.fixupOrderWarehouseSelect );
                    if (order_type === 'warehouse-transfer') {
                        currentOrderWidget = new InventoryWidget({
                                        couchapp: couchapp,
                                        context: context,
                                        activity: activity
                                });
                    } else {
                        currentOrderWidget = new OrderWidget({
                                        couchapp: couchapp,
                                        context: context,
                                        activity: activity
                                });
                    }
                });
                    
        });

        // Called when the user submits an order to the system
        // order_type is receive or sale
        this.post('#/create-order/(.*)/(.*)', function(context) {
            var params = context.params.toHash(),
                order_type = context.params['splat'][0],
                order_number = context.params['splat'][1] || context.params['order-number'],
                updateOrdersItems = true,
                next_url;

            if (order_type === 'receive') {
                next_url = '#/';   // Go back to the start page
            } else if (order_type === 'sale') {
                next_url = context.path;  // stay at the same URL
            } else if (order_type === 'warehouse-transfer') {
                next_url = '#/';   // Go back to the start page
                updateOrdersItems = false;
                order_number = order_number || 'xfer-' + params['source-warehouse-name']
                                                + '-' + params['warehouse-name']
                                                + '-' + params['date'];
            } else {
                showNotification('error', 'Unknown type of order: '+order_type);
                return;
            }

            params._id = 'order-' + order_number;
            params['order-type'] = order_type;

            var whenDone = jQuery.Deferred();
            couchapp.update('order', params, {
                success: whenDone.resolve.bind(whenDone),
                error: whenDone.reject.bind(whenDone)
            });

            whenDone.done(
                function(orderDoc) {
                    context.updateOrdersItems(orderDoc)
                        .then( function() {
                            context.showNotification('success', 'Order ' + order_number + ' saved!');
                            activity.trigger('order-updated', orderDoc);
                            context.$element().empty();
                            context.redirect(next_url);
                        });
                });
            whenDone.fail(
               function(status, reason, message) {
                    $.log('Problem saving order '+ order_number +"\nmessage: " + message + "\nstatus: " + status + "\nreason: "+reason);
                    context.showNotification('error' , 'Problem saving order ' + order_number + ': ' + message);
                });
        });

        this.get('#/data/:type/', function dataLister(context) {
            context.deactivateOrderWidget();
            var search  = context.params['search-query'] || '';
                type    = context.params['type'],
                view    = type + '-by-any',
                list_q  = '_list/items/' + view;

            if (search) {
                list_q += '?search-query=' + encodeURIComponent(search);
            }

            // we'd rather use couchapp.list, but it only supports getting JSON data :(
            $.get(list_q)
                .then(function(content) {
                        context.$element().html(content);

                        context.toggleObsolete();
                        // The physical inventories lister should show the list of proposed corrections, too
                        if (type == 'inventories') {
                            couchapp.list('proposed-inventory-correction', 'inventory-by-permanent-warehouse-barcode', {
                                group: true,
                                dataType: 'html',
                                success: function(content) {
                                    context.$element().append(content);
                                },
                                error: function(status, reason, message) {
                                    showNotification('error', "Can't get physical inventory list: "+message);
                                }
                            });
                        }
                    },
                    function(result) {
                        showNotification('error', 'Error getting data for '+type+ ': ' + $.parseJSON(result.responseText).reason);
                    }
                );
        });

        this.get('#/edit/(.*)/(.*)', function(context) {
            context.deactivateOrderWidget();
            var type = context.params['splat'][0],
                item_id = context.params['splat'][1];

            this.editItemModal(type, item_id)
                .then(function(modal) {
                        window.history.back()
                    });
        });

        this.post('#/edit/(.*)/(.*)', function(context) {
            var type = context.params['splat'][0],
                this_id = context.params['splat'][1],
                modal = $('.modal');

            var Validator = couchapp.require('lib/validate');
            context.params.type = type;
            var validator = new Validator.Validator(context.params);

            validator.couchapp = couchapp;

            var noteError = function(err) {
                var fieldset = $('fieldset#' + err.field + '-field');
                fieldset.addClass('error');
                $('[name=' + err.field + ']', fieldset)
                    .after('<span class="help-inline label label-important"><i class="icon-exclamation-sign icon-white"></i>&nbsp;'
                            + err.reason + '</span>');
            };
            var saveItem = function(context) {
                // scanned is used in the receive/sale order page when an unknown
                // item is scanned, the user brings up the edit item form and changes
                // the barcode.  This retains the original scanned thing
                var scanned = context.params['scanned'];

                if (type == 'item') {
                    // Boolean options default to false
                    context.params['is-obsolete'] = context.params['is-obsolete'] || '';
                } else if (type == 'customer') {
                    context.params['is-taxable'] = context.params['is-taxable'] || '';
                } else if (type == 'warehouse') {
                    // nothing special for warehouses
                }

                couchapp.update(type, context.params, {
                    success: function(newDoc) {
                        modal.modal('hide');
                        activity.trigger(type + '-updated', { item: newDoc, scanned: scanned });
                        showNotification('success', type + ' saved');
                    },
                    error: function(status, reason, message) {
                        modal.modal('hide');
                        showNotification('error', 'Problem saving ' + type + ': ' + message);
                    }
                });
            };

            // Remove any errors from the last time they tried to submit
            $('fieldset.error span.help-inline', context.$element()).remove();

            var savable = jQuery.Deferred();
            savable.done(function() { saveItem(context) });

            try { validator.validateAll(noteError) }
            catch(err) { savable.reject() };

            if (savable.state() === 'rejected') {
                return;
            }
            if (type == 'item') {
                var checkdupsCount = 2;
                ['barcode','sku'].forEach(function(param) {
                    validator.unique(param)
                        .fail(function(err) {
                            noteError(err);
                            savable.reject();
                        })
                        .done(function() {
                            if (--checkdupsCount === 0) {
                                savable.resolve();
                            }
                        });
                });
                       
            } else if (type == 'customer') {
                savable.resolve();
            } else if (type == 'warehouse') {
                validator.unique('name')
                    .fail(function(err) {
                        noteError(err);
                        savable.reject();
                    })
                    .done(function() {
                        savable.resolve();
                    });
            }
                
        });

        this.get('#/delete/:thing/:id', function(context) {
            context.deactivateOrderWidget();
            var docid = context.params['id'],
                thing = context.params['thing'],
                doc,
                modal,
                show_q = '_show/delete-thing/' + docid;

            function cleanUpModal () {
                if (modal) {
                    modal.modal('hide');
                    modal.remove();
                    window.history.back();
                }
            }

            couchapp.db.openDoc(docid, {
                success: function(loadedDoc) {
                    if (loadedDoc.type != thing) {
                        context.showNotification('error', 'Expected document ' + docid + ' to be a ' + thing
                                                            + ', but it is a ' + loadedDoc.type);
                        cleanUpModal();
                    } else {
                        doc = loadedDoc;
                    }
                },
                error: function(code, error, reason) {
                    cleanUpModal();
                    context.showNotification('error', 'There is no '+ thing + 'with id ' + docid);
                }
            });
    
            $.get(show_q)
                .then(function(content) {
                    modal = $(content).appendTo(context.$element())
                                   .modal({backdrop: true, keyboard: true, show: true});
                    modal.on('hidden', function() {
                                            modal.remove();
                                            window.history.back();
                                        });
                    modal.find('#delete-confirm')
                        .click( function(event) {
                            couchapp.db.removeDoc(doc, {
                                success: function() {
                                    showNotification('success', context.params['thing'] + ' removed');
                                    modal.modal('hide');
                                },
                                error: function(status) {
                                    context.log('delete failed after removeDoc');
                                    context.log(doc);
                                    context.log(status);
                                    modal.modal('hide');
                                    showNotification('error', 'Delete failed');
                                }
                            })
                            event.preventDefault();
                        });
                });
            
        });


        this.get('#/report/inventory/', function(context) {
            context.deactivateOrderWidget();
            var search = context.params['search-query']
                list_q = '_list/current-inventory-report/inventory-by-permanent-warehouse-barcode?group=true&startkey=[1]';

            if (search) {
                list_q += '&search-query=' + encodeURIComponent(search);
            }
            context.$element().load(list_q, function() {
                new InventoryReport({
                        context: context,
                        activity: activity,
                        couchapp: couchapp
                    });
            });
        });

        this.get('#/report/item-history/:barcode', function(context) {
            context.deactivateOrderWidget();
            var list_q = '_list/item-history/item-history-by-barcode-date';

            if ('barcode' in context.params) {
                list_q += '?startkey=' + encodeURIComponent(JSON.stringify([context.params.barcode]))
                        + '&endkey=' + encodeURIComponent(JSON.stringify([context.params.barcode,{}]));
            }

            $.ajax({
                url: list_q,
                type: 'GET',
                async: true,
                dataType: 'html',
                success: function(content) {
                    var answer = context.newdialogModal('Item History',
                                                        $(content),
                                                        ['Ok']);
                    answer.always(function() {
                        window.history.back()
                    });
                },
                error: function(code, error, message) {
                    showNotification('error', 'History not available: '+message);
                }
            });
        });

        this.get('#/report/shipment-summary/', function(context) {
            context.deactivateOrderWidget();
            var list_q = '_list/shipment-summary-report/shipments-by-date',
                params = [];

            if (context.params.start) {
                context.params.startey = context.todayAsString();
            }
            // I'd rather the form just submitted itself, but CouchDB requires the startkey and endkey
            // be JSON encoded strings, which must have quotes around it, and the normal form submission
            // process won't do that.  So, we need to reformat the startkey and endkey params before
            // making the list request.
            if (context.params.startkey || context.params.endkey) {
                list_q += '?';
                if (context.params.startkey) {
                    params.push('startkey="' + encodeURIComponent(context.params.startkey)+'"');
                }
                if (context.params.endkey) {
                    params.push('endkey="' + encodeURIComponent(context.params.endkey)+'"');
                }
                list_q += params.join('&');
            }

            context.$element().load(list_q, function() {
                var form = context.$element().find('form#date-selector'),
                    start_date = form.find('input[name="startkey"]'),
                    end_date = form.find('input[name="endkey"]');

                start_date.change(function(e) {
                    var startkey = start_date.val(),
                        endkey = end_date.val();

                    if (!endkey) {
                        end_date.val(startkey);
                    }
                });

                form.submit(function(e) {
                    var startkey = start_date.val(),
                        endkey = end_date.val(),
                        url,
                        params = [];

                    url = context.path.replace(/\?.*$/, '');  // Remove any params already there
                    if (startkey) {
                        params.push('startkey='+startkey);
                    }
                    if (endkey) {
                        params.push('endkey='+endkey);
                    }
                    if (params.length) {
                        url += '?' + params.join('&');
                    }
                    context.redirect(url);

                    return false;
                });

            });

        });


    });

    activity.run('#/');

};
