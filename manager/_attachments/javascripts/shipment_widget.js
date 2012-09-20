// The DOM should have a few items already populated:
//    table#order-display
//    form#barcode-scan
//    form#order-form
//
// As items are scanned in, it adds hidden input elements ot the order-form
//
// Configuration params allowed:
//      couchapp: the couchapp object
//      context: the Sammy.js context object
//      activity: the Sammy.js app object
function ShipmentWidget(params) {

    var unfilledTable = $('table#unfilled-items'),
        shippingTable = $('table#shipping-items'),
        barcodeScan = $('form#barcode-scan'),
        barcodeInput = $('input#barcode'),
        orderForm = $('form#order-form'),
        couchapp = params.couchapp,
        context = params.context,
        activity = params.activity,
        orderNumberInput = $('input#order-number', orderForm),
        unfilledManager = new ItemManager({ table: unfilledTable} ),
        shippingManager = new ItemManager({ table: shippingTable, should_manage_quantities: true} );

    // Turn off browser autocomplete for all the form fields
    $('input[type=text]').attr('autocomplete', 'off');

    // Connect any already-existing item rows' button callbacks
    $('button.add-item', unfilledTable).click(unfilledItemClicked);
    $('button.add-item', shippingTable).click(shippingItemClicked);

    // When a barcode is scanned in
    barcodeScan.submit(function(e) {
        var barcode = barcodeInput.val(),
            name,
            modalDone;
        barcodeInput.blur();
        if (unfilledManager.hasBarcode(barcode)) {
            if (unfilledManager.removeItem(barcode)) {
                name = unFilledManager.itemName(barcode);
                shippingManager.addItem(barcode,name);
                modalDone = true;
            } else {
                modalDone = context.errorModal('Barcode', 'Item with barcode '+barcode+' has already been fully shipped');
            }
        } else {
            modalDone = context.errorModal('Barcode', 'Barcode '+barcode+' is not part of this order');
        }

        $.when(modalDone)
            .done( function() {
                barcodeInput.val('');
                barcodeInput.focus();
            });

        return false;  // Don't conplete the form submit
    });


    // When the select button for an unfilled item is clicked
    function unfilledItemClicked(e) {
        var barcode = $(e.currentTarget).attr('data-barcode');
        moveOneItem(barcode, unfilledManager, shippingManager);
    }

    function shippingItemClicked(e) {
        var barcode = $(e.currentTarget).attr('data-barcode');
        moveOneItem(barcode, shippingManager, unfilledManager);
    }
        
    function moveOneItem(barcode, source, dest) {
        var name;
        if (source.removeItem(barcode)) {
            name = source.itemName(barcode);
            dest.addItem(barcode, name);
        }
    }

    // Given a scan (usually a barcode), return the hidden input
    // element from order-form that stores the quantity. 
    function inputForScan(scan) {
        var input_id = 'scan-'+scan+'-quan';
        var input = $('input#'+input_id);
        if (! input.length) {
            // No input for this items yet. create one
            input = $('<input type="hidden" name="' + input_id + '" id="' + input_id + '" data-barcode="' + scan + '" value="0">');
            input.appendTo(orderForm);
        }
        return input;
    };


    // Object to manage the shipping and unfilled table data
    function ItemManager(opts) {
        this.table = opts.table;
        this.should_manage_quantities = opts.should_manage_quantities;
    }
    ItemManager.prototype.hasBarcode = function(barcode) {
        return this.trForBarcode(barcode).length > 0;
    }
    ItemManager.prototype.trForBarcode = function(barcode) {
        return this.table.find('button.add-item[data-barcode="'+barcode+'"]').parents('tr.line-item').first();
    }
    ItemManager.prototype.quantity = function(barcode, quantity) {
        var tr = this.trForBarcode(barcode),
            td = tr.find('td.item-count').first();
        if (quantity === undefined) {
            return parseInt(td.text());
        } else {
            if (this.should_manage_quantities) inputForScan(barcode).val(quantity);
            td.text(quantity);
        }
    }
    ItemManager.prototype.itemName = function(barcode) {
        var tr = this.trForBarcode(barcode),
            td = tr.find('td.item-name').first();
        return td.text();
    }
    ItemManager.prototype.removeItem = function(barcode) {
        var quantity = this.quantity(barcode);
        if (quantity > 0) {
            this.quantity(barcode, quantity - 1);
            return true;
        } else {
            return false;
        }
    }
    ItemManager.prototype.addItem = function(barcode, name) {
        if (! this.hasBarcode(barcode)) {
            var data = {    barcode: barcode,
                            quantity: 0,
                            name: name
                        };
                        
            var newTr = $($.mustache(couchapp.ddoc.templates.partials['edit-order']['shipment-item-row'], data));
            this.table.append(newTr);
            
            newTr.find('button.add-item').click( this.table == unfilledTable ? unfilledItemClicked : shippingItemClicked );
        }
        var quantity = this.quantity(barcode);
        this.quantity(barcode, quantity + 1);
    }

}