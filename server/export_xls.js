Router.map(function () {

    //Экспорт моделей в таблицу Excel
    this.route('exportCollectionToXLS', {
        where: 'server',
        path: '/grid/export/:collection?/:task?',
        action: function () {

            var self = this;
            try {

                console.log('Request export xls. GET: ', this.params, ', POST: ', this.request.body);

                if(!this.params.collection) throw new Error('Не передана коллекция');
                var collectionName = this.params.collection,
                    collection = AristosUtils.getCollection(collectionName);
                var rules = checkAccessForCollection(collectionName);

                var task = this.params.task;

                var xlsx = Meteor.require('excel-export');

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

                //Массив с хуками - доп функциями для обработки данных
                var parseHooks = [];

                /**
                 * Парсер характеристик моделей в Яндекс
                 */
                var hookYandexModelParams = function(dataRow, row, rows, colsConfig, cols) {
                    if(dataRow.details) {
                        dataRow.details.forEach(function(detailsGroup, detailsGroupKey) {
                            if(detailsGroup.params) {
                                detailsGroup.params.forEach(function(details, detailsKey){
                                    if(!colsConfig.hasOwnProperty(details.name)) {
                                        colsConfig[details.name] = {
                                            map: 'details['+detailsGroupKey+'].params['+detailsKey+'].value',
                                            paramNameMap: 'details['+detailsGroupKey+'].params['+detailsKey+'].name'
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
                    return row;
                };

                /**
                 * Парсер товарных предложений Яндекс
                 */
                var offersColsSettedUp = false;
                var hookYandexOffers = function(dataRow, row, rows, colsConfig, cols) {
                    var originRow = _.clone(row);
                    if(typeof dataRow.offers != 'undefined' && dataRow.offers.length) {
                        if(!offersColsSettedUp) {
                            cols.push({
                                caption: 'Цена магазина',
                                type: 'number'
                            });
                            cols.push({
                                caption: 'Название магазина',
                                type: 'string'
                            });
                            cols.push({
                                caption: 'Рейтинг магазина',
                                type: 'number'
                            });
                            cols.push({
                                caption: 'Отзывов',
                                type: 'number'
                            });
                            cols.push({
                                caption: 'Стоимость доставки',
                                type: 'number'
                            });
                            offersColsSettedUp = true;
                        }
                        for(var i = 0; i < dataRow.offers.length; i++) {
                            var offer = dataRow.offers[i].offer;
                            if(offer) {
                                console.log('Generate new row: ', '['+i+'/'+dataRow.offers.length+']');
                                row = _.clone(originRow);
                                row.push(AristosUtils.getValueForPosition('price.value', offer, ''));
                                row.push(AristosUtils.getValueForPosition('shopInfo.name', offer, ''));
                                row.push(AristosUtils.getValueForPosition('shopInfo.rating', offer, 0));
                                row.push(AristosUtils.getValueForPosition('shopInfo.gradeTotal', offer, 0));
                                row.push(AristosUtils.getValueForPosition('delivery.price.value', offer, 0));
                                console.log(row);
                                if(!(i + 1 == dataRow.offers.length)) {
                                    console.log('Row pushed');
                                    rows.push(row);
                                }
                            }
                        }
                    }
                    return row;
                };

                var colsConfig = {};
                switch (task) {
                    case 'offers':
                        colsConfig = {
                            'Название': {
                                map: 'main.model.name',
                                width: 25
                            },
                            'Запрос': {
                                map: 'searchString'
                            },
                            'Наша цена': {
                                map: 'phillips_price',
                                type: 'number'
                            },
                            'Средняя цена': {
                                map: 'main.model.prices.avg',
                                type: 'number'
                            }
                        };
                        parseHooks.push(hookYandexOffers);
                        break;
                    case 'models':
                        colsConfig = {
                            'ID': {
                                map: 'modelId',
                                type: 'number'
                            },
                            'Категория': {
                                map: 'category.name',
                                width: 30,
                                beforeCellWrite:function(row, cellData){
                                    return cellData.toUpperCase();
                                }
                            },
                            'Название': {
                                map: 'main.model.name',
                                width: 25
                            },
                            'Производитель': {
                                map: 'main.model.vendor'
                            },
                            'Рейтинг': {
                                map: 'main.model.rating',
                                type: 'number'
                            },
                            'Предложений': {
                                map: 'main.model.offersCount',
                                type: 'nubmer'
                            }
                        };
                        parseHooks.push(hookYandexModelParams);
                        break;
                    default:
                        //TODO Реализовать автоматический разбор коллекции
                        var colsParams = this.request.body.columns || this.params.columns;
                        if(colsParams) {
                            try {
                                colsParams = JSON.parse(colsParams);
                                _.each(colsParams, function(colOpts, colMap) {
                                    var type;
                                    switch(colOpts.type) {
                                        case 'int':
                                        case 'float':
                                        case 'number':
                                            type = 'number';
                                            break;
                                        default:
                                            type = 'string';
                                    }
                                    colsConfig[colOpts.text] = {
                                        map: colMap,
                                        type: type,
                                        //width: parseInt(colOpts.width / 10)
                                    }
                                });
                            } catch(e) {
                                throw new Error('Конфигурация столбцов некорректная. ' + e.message);
                            }
                        } else {
                            throw new Error('Необходимо указать задачу. Авто-разбор модели не реализован');
                        }

                        //По-умолчанию самостоятельно определяем конфигурацию полей для экспорта
                        /*data.forEach(function(row){
                            //Разбор объекта
                            _.each(row, function(){});
                        });
                        */
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
                    var self = this,
                        row = [];
                    //Заполняем строки исходя из конфигурации колонок
                    _.each(colsConfig, function(colConfig, colName) {
                        if(colConfig.hasOwnProperty('paramNameMap') && AristosUtils.getValueForPosition(colConfig.paramNameMap, dataRow) != colName) {
                            //Если в конфигурации присутствует параметр paramNameMap, значит требуется проверить соответствие названия колонки
                            //Если название колонок не совпадает, пишем пустое значение
                            row.push('');
                        } else {
                            row.push(AristosUtils.getValueForPosition(colConfig.map, dataRow, ''));
                        }
                    });

                    //Применяем дополнительные хуки для обработки строки
                    _.each(parseHooks, function(hookFunction){
                        if(typeof hookFunction == 'function') row = hookFunction.call(self, dataRow, row, rows, colsConfig, cols);
                    });

                    rows.push(row);
                });

                //Выравниваем кол-во столбцов в каждом ряду
                var colsLength = cols.length;
                _.each(rows, function(row, key){
                    if(row.length < colsLength) {
                        while(row.length < colsLength) {
                            row.push('');
                        }
                        rows[key] = row;
                    }
                });

                var conf = {};

                conf.cols = cols;
                conf.rows = rows;
                var result = xlsx.execute(conf);

                this.response.writeHead(200, {
                    'Content-Type': 'application/vnd.openxmlformats',
                    'Content-Disposition': 'attachment; filename="export_' + collectionName.toLowerCase() + '.xlsx"'
                });
                this.response.end(result, 'binary');

            } catch(e) {
                console.log(e.stack);
                this.response.end('<script>' +
                    'if(typeof parent.aEvent == "object") { ' +
                    '   parent.aEvent.error("'+e.message+'");' +
                    '} else {' +
                    '   alert("Ошибка выполнения: '+e.message+'");' +
                    '}' +
                '</script>');
            }
        }
    });
});