// shipment-summary-report list
// list shipments between the given start and end date

function(head, req) {
    var ddoc = this,
        Mustache = require('vendor/couchapp/lib/mustache'),
        Money = require('views/lib/money');

    provides('html', function() {
        var row,
            rowTemplate = ddoc.templates.partials['shipment-summary-report-shipment'];

        send(Mustache.to_html(ddoc.templates['shipment-summary-report'],
                                { start_key: req.query.start_key, end_key: req.query.end_key }));

        while (row = getRow()) {
            row.value['shipping-date'] = row.key;
            row.value['shipping-cost'] = Money.toDollars(row.value['shipping-cost']);
            row.value['total-taxes'] = Money.toDollars(row.value['total-taxes']);
            row.value['total-charge'] = Money.toDollars(row.value['total-charge']);
            row.value['shipping-charge'] = Money.toDollars(row.value['shipping-charge']);
            row.value.items.forEach(function(itemData) {
                itemData['price-each'] = Money.toDollars(itemData['price-each']);
                itemData['quantity-price'] = Money.toDollars(itemData['quantity-price']);

            });
            send(Mustache.to_html(rowTemplate, row.value));
        }
        return ' ';
    });

}