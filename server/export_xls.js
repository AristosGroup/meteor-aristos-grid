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
                var rules = GridData.checkAccessForCollection(collectionName);

                var settings = {};
                var params = _.extend(this.params, this.request.body);
                params.limit = 1000000;
                GridData.parseFilters(params, settings);
                GridData.check = false;
                console.log('Parsed Settings', settings);

                var task = this.params.task;

                var xlsx = Meteor.require('excel-export');

                console.log('Экспортируем коллекцию ' + collectionName + ' с фильтром ',
                    settings.filter,  ' и параметрами ', settings.options);

                var data = collection.find(settings.filter, settings.options);
                console.log('Data count: ', data.count());

                //Массив с хуками - доп функциями для обработки данных
                var parseHooks = [];
                var colsConfig = {};
                var fileName = collectionName.toLowerCase();

                if(task) {
                    if(GridData.exportTasks.hasOwnProperty(task)) {
                        //Получаем данные задания
                        var taskData = GridData.exportTasks[task];
                        colsConfig = taskData.cols;
                        if(taskData.hooks.length) {
                            taskData.hooks.forEach(function(hook){
                                parseHooks.push(hook);
                            });
                        }
                        fileName = task.toLowerCase();
                    } else {
                        throw new Error('Задания ' + task + ' для коллекции ' + collectionName + ' не существует');
                    }
                } else {
                    //По-умолчанию экспортируем файл с общими настройками (если предоставлены данные о колонках
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
                                    type: type
                                }
                            });
                        } catch(e) {
                            throw new Error('Конфигурация столбцов некорректная. ' + e.message);
                        }
                    } else {
                        throw new Error('Необходимо указать задачу. Авто-разбор модели не реализован');
                    }
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
                    'Content-Disposition': 'attachment; filename="export_' + fileName + '.xlsx"'
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