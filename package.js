Npm.depends({
    'excel-export': '0.3.11'
});

Package.describe({
    summary: "Grid module based on jqWidgets.Grid"
});

Package.on_use(function (api) {
    api.use(['iron-router', 'aristos-mongo-distinct'], 'server');
    api.use(['underscore', 'moment', 'deps', 'aristos-base'], ['client', 'server']);
    api.use(['templating', 'handlebars', 'session'], 'client');
    api.use(['jqwidgets'], 'client');

    api.add_files(['server/grid_data_class.js', 'server/export_xls.js', 'server/export_json.js'], 'server');
    api.add_files(['lib/grid.js']);
    api.add_files(['client/grid.html', 'client/states.html', 'client/states.js'], 'client');

    api.export('GridData', 'server');
});
