Router.map(function () {

    //this.route('yandex')

    //Вывод коллекции в JSON
    this.route('exportCollectionToJSON', {
        where: 'server',
        path: '/grid/export.json',
        action: function () {

            try {
                var self = this;
                //this.response.useChunkedEncodingByDefault = false;
                //this.response.httpVersion = '1.0';
                //this.response.httpVersionMinor = 0;
                this.response.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8'
                });
                //console.dir(this.response.connection);
                this.response.connection.setTimeout(0);
                console.log('Request export json. Params: ', this.params);

                //Попытка распознания коллекции
                if(!this.params.collection) throw new Error('Не передана коллекция');
                var collectionName = this.params.collection,
                    collection = AristosUtils.getCollection(collectionName);
                var rules = GridData.checkAccessForCollection(collectionName);

                var settings = {};
                GridData.parseFilters(this.params, settings);
                console.log('Parsed Settings', settings);

                console.log('Filter: ', settings.filter, '\nOptions:', settings.options);


                var query = collection.find(settings.filter, settings.options),
                    rows = query.fetch();

                var distincts = {};
                var distinctsParams = (this.params.distincts ? this.params.distincts.split(',') : []);
                if(distinctsParams.length) {
                    _.each(distinctsParams, function(val) {
                        if(settings.filter.hasOwnProperty(val)) {
                            distincts[val] = collection.distinct(val);
                        } else {
                            distincts[val] = collection.distinct(val, settings.filter);
                            /*
                            var unique = {};
                            distincts[val] = [];
                            for(var i in rows) {
                                var rowData = rows[i];
                                if(rowData.hasOwnProperty(val)) {
                                    if(!unique.hasOwnProperty(rowData[val])) {
                                        distincts[val].push(rowData[val]);
                                        unique[rowData[val]] = 1;
                                    }
                                }
                            }
                            */
                        }
                    });
                }

                var responseData = {
                    'limit': settings.limit,
                    'count': query.count(),
                    'rows': rows,
                    'distincts': distincts
                };
                var a = JSON.stringify(responseData);
                this.response.write(a);
                this.response.end('');
            } catch(e) {
                responseData = {
                    error: e.message,
                    stack: e.stack
                }
                console.log(e);
                this.response.end(JSON.stringify(responseData));
            }
        }
    });
});