Package.describe({
  summary: "Aristos-base"
});

Package.on_use(function(api) {
  api.use(['underscore','deps'], ['client', 'server']);
  api.use(['jqwidgets'], ['client']);

  api.add_files(['lib/grid.js']);
});
