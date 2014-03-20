Package.describe({
  summary: "Grid module based on jqWidgets.Grid"
});

Package.on_use(function(api) {
  api.use(['iron-router'], 'server');
  api.use(['underscore','deps'], ['client', 'server']);
  api.use(['jqwidgets'], 'client');

  api.add_files(['lib/export_script.js'], 'server');
  api.add_files(['lib/grid.js']);
});
