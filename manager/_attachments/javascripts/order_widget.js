// The DOM should have a few items already populated:
//    table#order-display
//    form#barcode-scan
//    form#order-form
//
// As items are scanned in, it adds hidden input elements ot the order-form
function OrderWidget(couchapp, context, activity, orderDoc) {
    this.table = $('table#order-display');
    this.barcodeScan = $('form#barcode-scan');
    this.orderForm = $('form#order-form');

    var widget = this,
        barcodeInput = $('input#barcode', this.barcodeScan);

    this.barcodeScan.submit(function(e) {
        widget.addRemoveItem(barcodeInput.val(), 1);
        barcodeInput.val('');
        barcodeInput.focus();
        e.preventDefault();
        e.stopPropagation();
    });
    // Given a scan (usually a barcode), return the hidden input
    // element from order-form.  It creates a new input if it's not
    // there yet
    this.inputForScan = function(scan) {
        var input_id = 'scan-'+scan;
        var input = $('input#'+input_id);
        if (input.length == 0) {
            input = $('<input id="' + input_id + '" type="hidden" value="0">').appendTo(this.orderForm);
        }
        return input;
    };

    function centsToDollars (cents) {
        if (cents) {
            return (parseFloat(cents) / 100).toFixed(2);
        } else {
            return "0.00";
        }
    }

    activity.bind('item-updated', function(context,item) {
        // called when the add/edit item modal is submitted, so we can update the price/cost
        widget.getTableRowForScan(item.barcode)
            .then(function(tr) {
                tr.find('input.unit-cost').val(centsToDollars(item['cost-cents']));
                tr.find('td.item-name').text(item.name);
            });
    });


    // Given a scan (usually a barcode, return the table-row
    // element for the scan.  It will create a new row if it's
    // not there yet
    this.getTableRowForScan = function(scan) {
        var tr      = $('tr#scan-' + scan),
            table   = this.table,
            d       = jQuery.Deferred();

        if (tr.length) {
            d.resolve(tr);

        } else {
            $.get(couchapp.db.uri + couchapp.ddoc._id + '/templates/activity-receive-shipment-item-row.template')
                .then(function(content) {

                    var renderRow = function(item, is_unknown) {
                        content = $(context.template(content, { scan: scan,
                                                                unitCost: centsToDollars(item['cost-cents']),
                                                                count: 0,
                                                                is_unknown: is_unknown ? true : false,
                                                                name: item['name'] }));
                        table.append(content);
                        $('button.add-item', content).click( function(e) { widget.addRemoveItem(scan, 1) } );
                        $('button.remove-item', content).click( function(e) { widget.addRemoveItem(scan, -1) } );
                        $('button.delete-item', content).click( function(e) { widget.deleteItem(scan) } );
                        $('button.is-unknown', content).click( function(e) { context.editItemModal('item',scan) });
                        d.resolve(content);
                    };

                    couchapp.view('items-by-barcode', {
                        include_docs: true,
                        key: scan,
                        success: function(data) {
                            if (data.rows.length == 1) {
                                renderRow(data.rows[0].doc);
                            } else {
                                couchapp.view('items-by-sku', {
                                    key: scan,
                                    include_docs: true,
                                    success: function (data) {
                                        if (data.rows.length == 1) {
                                            renderRow(data.rows[0].doc);
                                        } else {
                                            // This is an unknown item
                                            renderRow({ 'cost-cents': '', name: ''}, true);
                                        }
                                    }
                                });
                            }
                        }
                    });
                });
        }
        return d;
    };

    this.addRemoveItem = function(scan, delta) {
        var input = this.inputForScan(scan);
            count = parseInt(input.val());
        count += delta;
        input.val(count);

        this.getTableRowForScan(scan)
            .then(function(tr) {
                $('td.item-count',tr).text(count);
            });
    };

    this.deleteItem = function(scan) {
        var input = this.inputForScan(scan);
        input.remove();
        this.getTableRowForScan(scan)
            .then(function(tr) {
                tr.animate( { height: '0px' },
                            { duration: 500,
                                complete: function() { tr.remove() } });
            });
    };
            
        
    
}
