Router.map(function () {

    //Экспорт моделей в таблицу Excel
    this.route('exportCollectionToXLS', {
        where: 'server',
        path: '/grid/export/:collection?/:task?',
        action: function () {
            var self = this;
            console.log('Request export xls. GET: ', this.params, ', POST: ', this.request.body);

            if(!this.params.collection) throw new Error('Не передана коллекция');
            var collectionName = this.params.collection,
                collection = AristosUtils.getCollection(collectionName);

            var task = this.params.task;

            var xlsx = Meteor.require('excel-export');

            /*
            //Старый режим - по ID
            if(!this.request.body.ids) {
                //TODO Убрать тестовые ID
                //throw new Error('Не переданы ID моделей');
                this.request.body.ids = [10409554, 7320732];
            }
            var modelIds = this.request.body.ids;
            var data = collection.find({modelId: {$in: modelIds}}, {reactive: false});
            */

            //Применяем основной фильтр
            var filters = this.request.body.filters || this.params.filters;
            if(filters) {
                try {
                    filters = AristosUtils.JSON.parse(filters);
                } catch(e) {
                    console.log('Ошибка обработки фильтра: ', e);
                    filters = {};
                }
            } else {
                filters = {};
            }
            var options = this.request.body.options || this.params.options;
            if(options) {
                try {
                    options = JSON.parse(options);
                } catch(e) {
                    console.log('Ошибка обработки фильтра: ', e);
                    options = {};
                }
            } else {
                options = {};
            }

            console.log('Экспортируем коллекцию ' + collectionName + ' с фильтром ', filters,  ' и параметрами ', options);

            var data = collection.find(filters, options);
            console.log('Data count: ', data.count());

            var parseHooks = [];
            switch (task) {
                case 'models':
                    var colsConfig = {
                        'SKU': {
                            map: 'modelId',
                            type: 'number'
                        },
                        'Категория': {
                            map: 'category.name',
                            width: 25,
                            beforeCellWrite:function(row, cellData){
                                return cellData.toUpperCase();
                            }
                        }
                    };

                    break;
                default:
                    //TODO Реализовать разбор
                    throw new Error('Необходимо указать задачу. Авто-разбор модели не реализован');
                    //По-умолчанию самостоятельно определяем конфигурацию полей для экспорта
                    data.forEach(function(row){
                        //Разбор объекта
                        _.each(row, function(){});
                    });
            }


            var cols = [],
                rows = [];

            if(!colsConfig) throw new Error('Не удалось получить конфигурацию таблицы');

            //Конфигурация колонок на основании общей конфигурации
            _.each(colsConfig, function(colConfig, colName) {
                cols.push(_.defaults(colConfig, {
                    caption: colName,
                    type: 'string'
                }));
            });

            data.forEach(function (dataRow) {
                var row = [];
                _.each(colsConfig, function(colConfig, colName) {
                    row.push(AristosUtils.getValueForPosition(colConfig.map, dataRow));
                });

                if(dataRow.details) {
                    dataRow.details.forEach(function(detailsGroup, detailsGroupKey) {
                        if(detailsGroup.params) {
                            detailsGroup.params.forEach(function(details, detailsKey){
                                if(!colsConfig.hasOwnProperty(details.name)) {
                                    colsConfig[details.name] = {
                                        map: 'model.details['+detailsGroupKey+'].params['+detailsKey+'].value'
                                    };
                                    cols.push(_.defaults(colsConfig[details.name], {
                                        caption: details.name,
                                        type: 'string'
                                    }));
                                    row.push(details.value);
                                }
                            });
                        }
                    });
                }
                rows.push(row);
            });


            /*

            var cols = [];
            var unsortedrows = [];
            var colsConfig = {
                category: {
                    colName: function () {
                        return 'Category';
                    },
                    value: function (row) {
                        if(row.category)
                            return row.category.name;

                        return false;
                    }
                },

                vendor: {
                    colName: function () {
                        return 'Vendor';
                    },
                    value: function (row) {
                        return row.main.model.vendor;
                    }
                },

                modelId: {
                    colName: function () {
                        return 'ModelId';
                    },
                    value: function (row) {
                        return row.modelId;
                    }
                },


                name: {
                    colName: function () {
                        return 'Name';
                    },
                    value: function (row) {
                        return row.main.model.name;
                    }
                },

                description: {
                    colName: function () {
                        return 'Description';
                    },
                    value: function (row) {
                        return row.main.model.description;
                    }
                },

                rating: {
                    colName: function () {
                        return 'Rating';
                    },
                    value: function (row) {
                        return row.main.model.rating;
                    },
                    type: 'number'
                },


                minPrice: {
                    colName: function () {
                        return 'minPrice';
                    },
                    value: function (row) {

                        if(row.main.model.prices)
                            return row.main.model.prices.min;
                        else
                            return null;
                    },
                    type: 'number'
                },


                maxPrice: {
                    colName: function () {
                        return 'maxPrice';
                    },
                    value: function (row) {
                        if(row.main.model.prices)
                            return row.main.model.prices.max;
                        else
                            return null;
                    },
                    type: 'number'
                },

                avgPrice: {
                    colName: function () {
                        return 'avgPrice';
                    },
                    value: function (row) {
                        if(row.main.model.prices)
                            return row.main.model.prices.avg;
                        else
                            return null;
                    },
                    type: 'number'
                },


                mainPhoto: {
                    colName: function () {
                        return 'mainPhoto';
                    },
                    value: function (row) {
                        return row.main.model.mainPhoto.url;
                    }
                },

                link: {
                    colName: function () {
                        return 'link';
                    },
                    value: function (row) {
                        return row.main.model.link;
                    }
                },
            };


            _.each(colsConfig, function(conf, index) {
                cols.push( {
                    caption: index,
                    type: _.isUndefined(conf.type) ? 'string': conf.type
                });
            });

            data.forEach(function (model) {
                var row = {};
                _.each(colsConfig, function(col, index) {
                    if(col.value(model))
                        row[index] = col.value(model);
                    else
                        row[index] = null;
                });


                if(model.details) {
                    model.details.forEach(function(detail) {
                        cols.push({caption:detail.name, type:'string'});
                        row[detail.name] =detail.value;

                    });
                }

                unsortedrows.push(row);
            });


            var rows = [];
            unsortedrows.forEach(function (model) {
                var row = [];
                _.each(cols, function(col, index) {
                    if( model[col.caption])
                        row[index] = model[col.caption];
                    else
                        row[index] = null;
                });

                rows.push(row);
            });

            */

            var conf = {};

            conf.cols = cols;
            conf.rows = rows;
            var result = xlsx.execute(conf);

            this.response.writeHead(200, {
                'Content-Type': 'application/vnd.openxmlformats',
                'Content-Disposition': 'attachment; filename="export_' + collectionName.toLowerCase() + '.xlsx"'
            });
            this.response.end(result, 'binary');
        }
    });
});