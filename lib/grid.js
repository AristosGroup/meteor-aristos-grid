/**
 * Инициализация таблицы с данными на основании предоставленной коллекции
 * @param collection String
 * @param options Object
 * @constructor
 */
Meteor.ReportGrid = function (collection, options) {
    var self = this;

    //if(!collection || !(typeof collection == 'object')) throw new Error('Не передана коллекция с данными');

    options = _.defaults(options, {
        name: 'ReportGrid',
        template: 'baseGrid',
        renderTo: '#jqxgrid',
        filters: {},
        sort: {},
        skip: 0,
        selectFields: {},
        limit: 1000,
        gridOptions: {},
        defaultGridState: {},
        customFilters: [], //Список дополнительных фильтров списка
        customFiltersClass: 'form-inline', //Класс формы с доп. фильтрами
        exportTasks: [], //Список дополнительных задач для экспорта
        mode: 'local', //Режим работы с данными. local - работа с целой коллекцией локально, reactive - работа с локальной реактивной коллекцией, server - фильтрация и сортировка на стороне сервера,
        saveState: true //Фунционал по сохранению фильтров
    });
    //console.log('Grid Options: ', options);

    this.options = options;
    this.collection = collection; //Название или объект с коллекцией (для реактивного режима)
    this.collectionName = options.collectionName || collection; //Название коллекции
    this.name = options.name || collection+'Grid'; //Уникальное название грида
    this.ready = false;
    this.columns = options.columns;
    this.dep = new Deps.Dependency;

    if(options.mode != 'reactive' && typeof collection == 'object' && typeof this.collectionName == 'string') {
        this.collection = this.collectionName;
    }

    this.statesCollectionName = self.name + 'States';
    this.collectionStates = new Meteor.Collection(this.statesCollectionName);
    this.escapeState = function(state, reverse) {
        if(state.columns) {
            _.each(state.columns, function(column, key){
                delete state.columns[key];
                var newKey;
                if(reverse) {
                    newKey = key.replace(new RegExp('>', 'g'), '.');
                } else {
                    newKey = key.replace(new RegExp('\\.', 'g'), '>');
                }
                state.columns[newKey] = column;
            });
        }
        return state;
    };

    this.collectionStates.allow({
        insert: function (userId, doc) {
            // only allow posting if you are logged in
            return true;
        },

        update: function (userId, doc) {
            // only allow posting if you are logged in
            return true;
        }
    });

    if (Meteor.isServer)
        this.server();

    if (Meteor.isClient) {
        Meteor.startup(function () {
            self.subscribe();
            self.render();
        });
    }
};

Meteor.ReportGrid.prototype.server = function () {
    var self = this;

    if(self.options.mode == 'reactive') {
        //console.log('Publishing ' + this.name + '');
        Meteor.publish(this.name, function (options) {
            //console.log('Requesting published collection with options: ', options);
            //return self.collection.find(options.filters, {fields: options.selectFields});
            //Публикуем коллекцию целиком чтобы иметь возможность применять фильтры динамически
            return self.collection.find();
        });
    }

    Meteor.publish(self.statesCollectionName, function () {
        return self.collectionStates.find();
    });
};


Meteor.ReportGrid.prototype.subscribe = function () {
    var self = this;
    var res = [];
    res.push(Meteor.subscribe(this.statesCollectionName));
    return res;
};

Meteor.ReportGrid.prototype.setFilters = function (filters) {
    this.options.filters = filters;
    this.dep.changed();
}

Meteor.ReportGrid.prototype.setState = function (stateId) {
    var self = this,
        options = this.options;
    console.log('Changing grid state: ', stateId);
    Session.set(this.name + 'stateId', stateId);
    if (stateId) {
        var newstate = self.collectionStates.findOne(stateId);
        if(newstate) {
            newstate.state = self.escapeState(newstate.state, true);
            console.log('Loading state: ', newstate);
            $(options.renderTo).jqxGrid('loadstate', newstate.state);
        } else {
            console.warn('Набора фильтров с id '+stateId+' не существует');
        }
        //Отложенная загрузка статуса
        /*setTimeout(function() {
        }, 300);*/
    } else {
        $(options.renderTo).jqxGrid('loadstate', options.defaultGridState);
    }
};

Meteor.ReportGrid.prototype.states = function () {
    return this.collectionStates;
};

Meteor.ReportGrid.prototype.meta = function () {
    return this.collectionMeta;
};

/**
 * Экспортирование текущих данных в XLS
 * @param task [optional] - наименование задачи (доп. обработка списка)
 */
Meteor.ReportGrid.prototype.exportXLS = function (task) {
    if(!task) task = '';

    var self = this,
        options = self.options,
        filters = options.filters,
        filtersJSON = AristosUtils.JSON.stringify(filters);

    //Ручное формирование набора фильтров и отправка на сервер для генерации Excel файла
    var state = $(options.renderTo).jqxGrid('getstate'),
        requestData = {};
    //Получение данных о фильтрах
    requestData = _.extend(requestData, state.filters);
    //Получение данных о сортировке
    if(state.sortcolumn) {
        requestData.sortdatafield = state.sortcolumn;
        requestData.sortorder = state.sortdirection.ascending ? 'asc' : 'desc';
    }
    //Получение данных о столбцах
    var cols = state.columns;
    //Сортировка
    _.each(cols, function(val, key) {
        val.map = key;
        cols[key] = val;
    });
    cols = _.sortBy(cols, 'index');
    var newCols = {};
    _.each(cols, function(val, key){
        if(!val.hidden) {
            newCols[val.map] = _.omit(val, ['cellsalign', 'draggable', 'groupable', 'hidden', 'index', 'pinned', 'resizable']);
        }
    });
    requestData.columns = JSON.stringify(newCols);
    console.log(requestData);

    //Создаем скрытый iframe и форму, сабмитим форму в iframe
    var $form = $("#exportForm");
    if(!$form.length) {
        $form = $('<form id="exportForm" method="POST" target="exportFrame" style="display: none;"></form>');
        $('body').append($form);
    }
    $form.html('');
    var $iframe = $('#exportFrame') ;
    if(!$iframe.length) {
        $iframe = $('<iframe src="about:blank" name="exportFrame" id="exportFrame" style="position: absolute; left: -10px; width:1px;height:1px;"></iframe>');
        $('body').append($iframe);
    }
    $form.attr('action', '/grid/export/'+ self.collectionName +'/'+task);
    _.each(requestData, function(reqVal, reqKey) {
        $form.append('<textarea name="'+reqKey+'">'+reqVal+'</textarea>');
    });
    $form.append('<textarea name="filters">'+filtersJSON+'</textarea>');
    $form.append('<input type="submit">');
    $form.submit();
};

Meteor.ReportGrid.prototype.render = function () {

    var self = this,
        options = this.options;

    Template['gridStates'].helpers({
        states: function () {
            return self.collectionStates.find();
        }
    });

    Template[options.template].rendered = function () {

        var $grid = $(options.renderTo);

        //Зависимость подписки на коллекцию
        Deps.autorun(function () {
            console.log('Grid subscription renew');
            self.dep.depend();
            switch(options.mode) {
                case 'reactive':
                    Meteor.subscribe(self.name, {
                        selectFields: self.selectFields,
                        filters: self.options.filters,
                        limit: self.options.limit,
                        skip: self.options.skip,
                        sort: self.options.sort
                    });
                    break;
                case 'local':

                    break;
                default: $grid.jqxGrid('updatebounddata');
            }
        });

        var columns = [];
        var datafields = [];
        var distincts = [];
        var mapType = {};
        for (var c in self.columns) {
            if(!self.columns.hasOwnProperty(c)) continue;
            var opt = self.columns[c];
            if(opt.map) opt.name = opt.map; //Требуется, чтобы название поля равнялось маппингу для дальнейшей фильтрации на сервере
            if(!opt.name) {
                console.error('Не передано значение name и map для колонки', c, opt);
                $.error('Не передано значение name и map для колонки');
            }
            if(!opt.type) opt.type = 'string';
            opt.originType = opt.type;
            if(!opt.filtertype) {
                switch (opt.type) {
                    case 'int':
                    case 'float':
                    case 'number':
                    case 'count':
                        opt.type = 'number';
                        opt.filtertype = 'number';
                        break;
                    case 'date':
                        opt.filtertype = 'date';
                        break;
                }
            }
            if(!opt.label) opt.label = opt.map.substr(opt.map.lastIndexOf('.') + 1);
            if(!opt.text && opt.label) opt.text = opt.label;
            opt.dataField = opt.name;
            datafields.push(_.pick(opt, 'name', 'type', 'map'));
            if(opt.type != 'hidden') {
                columns.push(_.pick(opt,
                    'type', 'originType', 'text', 'dataField', 'width', 'height', 'align', 'cellsalign', 'cellsformat', 'aggregates', 'pinned',
                    'cellsalign', 'cellsformat', 'cellsrenderer', 'filtertype', 'filteritems', 'renderer'
                ));
            }
            if(opt.filtertype == 'checkedlist' && !opt.filteritems) distincts.push(opt.map);
            mapType[opt.map] = opt.type;
        }
        self.mapType = mapType;

        var source = {};
        var updateBoundData = function(type) {
            $grid.jqxGrid('updatebounddata', type);
        };
        if(options.mode == 'server') {

            source = {
                datatype: "json",
                datafields: datafields,
                async: true,
                url: "/grid/export.json",
                data: {
                    collection: self.collection,
                    filters: function(){
                        return AristosUtils.JSON.stringify(options.filters);
                    },
                    distincts: distincts.join(',')
                },
                root: 'rows',
                totalrecords: 0,
                beforeprocessing: function (data) {
                    if(data.error) {
                        aEvent.error(data.error);
                    } else {
                        source.totalrecords = data.count;
                        if(data.distincts) {
                            _.each(data.distincts, function(distinctValues, colMap) {
                                _.each(columns, function(colRow, colId) {
                                    if(colRow.dataField == colMap) {
                                        columns[colId].filteritems = distinctValues;
                                        $('#jqxgrid').jqxGrid('setcolumnproperty', colMap, 'filteritems', distinctValues);
                                        //console.log('New distinct value for col ' + colMap + ':  ', distinctValues);
                                    }
                                });
                            });
                        }
                    }
                },
                sort: function(){ updateBoundData('sort'); },
                filter: function() { updateBoundData('filter'); }
            }
        } else if(options.mode == 'reactive') {
            var rows = null;

            //Зависимость от изменений коллекции
            Deps.autorun(function () {
                rows = self.collection.find(self.options.filters, {fields: self.options.selectFields, sort: self.options.sort }).fetch();
                source.localdata = rows;
                $grid.jqxGrid('updatebounddata');
                $grid.jqxGrid('autoresizecolumns');
            });
            source = {
                localdata: rows,
                datatype: "array",
                datafields: datafields
            };
        } else {
            //local mode
            rows = null;
            $grid.on('initialized', function () {
                console.log('Grid Initialized');
                $(this).jqxGrid('showloadelement');
            });
            Deps.autorun(function () {
                self.dep.depend();
                console.log('Request new data set');
                $(this).jqxGrid('showloadelement');
                Meteor.http.get('/grid/export.json?limit=1000000&collection='
                    + self.collection + '&filters='
                    + AristosUtils.JSON.stringify(options.filters), function( err, res ){
                    $grid.jqxGrid('hideloadelement');
                    try {
                        if(typeof res.data != 'undefined' && res.data.error)
                            err = 'Ошибка получения данных: ' + res.data.error;
                        if(err) {
                            throw new Error(err);
                        } else {
                            if(!res.data.rows) throw new Error('Ошибка получения данных для вывода');
                            rows = res.data.rows;
                            source.localdata = rows;
                            $grid.jqxGrid('updatebounddata');
                            $grid.jqxGrid('autoresizecolumns');
                        }
                    } catch(e) {
                        aEvent.error(e.message);;
                    }
                });
            });
            source = {
                localdata: rows,
                datatype: "array",
                datafields: datafields
            };
        }

        var dataAdapter = new $.jqx.dataAdapter(source, {
            beforeLoadComplete: function (r, nr) {
                if(options.mode == 'server') nr = nr.rows;
                var rows = [];
                _.each(nr, function (item) {
                    var row = {};
                    _.each(self.columns, function (opt) {
                        var val;
                        if(typeof opt.val == 'function') {
                            val = opt.val(item);
                        } else {
                            val = AristosUtils.getValueForPosition(opt.map, item);
                        }
                        switch (opt.originType) {
                            case 'float':
                            case 'number':
                                val = parseFloat(val) || '';
                                break;
                            case 'int':
                                val = parseInt(val) || '';
                                break;
                            case 'count':
                                //val = val.hasOwnProperty('length') ? val.length : 0;
                                break;
                            case 'date':
                                if(moment(val).isValid()) {
                                    val = moment(val).lang('ru').format('lll');
                                }
                                break;
                        }
                        row[opt.name] = val;
                    });
                    rows.push(row);
                });
                return rows;
            }
        });
        var gridOptions = _.extend({
            theme: 'arctic',
            width: '100%',
            //height: '100%',
            autoheight: true,
            //autorowheight: true,
            //rowsheight: 40,
            source: dataAdapter,
            sortable: true,
            groupable: true,
            filterable: true,
            filtermode: 'excel',
            showfilterrow: false,
            autoshowfiltericon: true,
            pageable: true,
            pagesize: 10,
            pagesizeoptions: [10, 50, 100, 200, 400, 1000, 10000],
            showaggregates: true,
            showstatusbar: true,
            showdefaultloadelement: false,
            columnsresize: true,
            columnsreorder: true,
            //autoloadstate: true,
            //autosavestate: true,
            statusbarheight: 50,
            columns: columns
        }, options.gridOptions);
        if(options.saveState) {
            gridOptions.showtoolbar = true;
            gridOptions.rendertoolbar = function (toolbar) {
                var me = this;
                var $container = $("<div style='margin: 5px;'></div>"),
                    $btnSaveState = $('<button class="btn btn-default btn-xs" style="margin-right: 5px;" id="btnGridSaveState"><i class="fa fa-plus"></i> Сохранить вид</button> '),
                    $btnResetState = $('<button class="btn btn-default btn-xs" style="margin-right: 5px;" id="btnGridResetState"><i class="fa fa-times-circle-o"></i> Сбросить текущий вид</button> ');
                //Наполнение статусов
                var $stateSelectGroup = $('<div class="btn-group">' +
                    '<button class="btn btn-default btn-xs dropdown-toggle" data-toggle="dropdown">Загрузка вида <span class="caret"></span></button>' +
                    '<ul class="dropdown-menu"></ul>' +
                    '</div>'),
                    $btnSelectState = $stateSelectGroup.find('button.dropdown-toggle'),
                    $stateSelectList = $stateSelectGroup.find('ul');
                Deps.autorun(function(){
                    $stateSelectList.html('');
                    var states = self.collectionStates.find();
                    if(states.count() == 0) {
                        $btnSelectState.addClass('disabled');
                    } else {
                        $btnSelectState.removeClass('disabled');
                        states.forEach(function(stateRow){
                            var $state = $('<li><a>' + stateRow.name + '</a></li>');
                            $state.find('a').click(function(){
                                self.setState(stateRow._id);
                            });
                            $stateSelectList.append($state);
                        });
                    }
                });
                //Экспортирование текущего вида в Excel
                var $btnExport = $('<button class="btn btn-default btn-xs" style="margin: 0 5px;" id="btnExportXLS"><i class="fa fa-table"></i> Сохранить в Excel</button>');
                $btnExport.on('click', function (e) {
                    e.preventDefault();
                    self.exportXLS();
                    /*
                    if(self.options.mode == 'server') {
                        self.exportXLS();
                    } else {
                        $grid.jqxGrid('exportdata', 'xls', self.name, true);
                    }
                    */
                });
                toolbar.append($container);
                $container.append($btnSaveState, $btnResetState, $stateSelectGroup, $btnExport);
                $btnSaveState.on('click', function (e) {
                    e.preventDefault();
                    bootbox.prompt("Сохранить набор фильтров", function (statename) {
                        if (statename === null) {
                        } else {
                            var savedState = $grid.jqxGrid('savestate');
                            savedState = self.escapeState(savedState);
                            console.log('Saving state: ', savedState);
                            self.collectionStates.insert({name: statename, state: savedState});
                        }
                    });
                });
                $btnResetState.on('click', function(e) {
                    e.preventDefault();
                    self.setState(null);
                    $grid.jqxGrid('clearfilters');
                });
            };
        }

        if(options.mode == 'server') {
            gridOptions = _.extend(gridOptions, {
                virtualmode: true, //Устанавливаем Grid в виртуальный режим, так мы сможем самостоятельно управлять отображаемыми данными
                rendergridrows: function (params) {
                    //console.log('Render Request', params);
                    return params.data;
                },
                groupable: false,
                autoloadstate: false,
                autosavestate: false,
                filtermode: 'default',
                showfilterrow: true
            });
        }

        //console.log('grid options: ', gridOptions, ' columns: ', columns, ' datafields: ', datafields);
        options.defaultGridState = gridOptions;
        //options.defaultGridState = $grid.jqxGrid('getstate');
        $grid.jqxGrid(gridOptions);


        //Инициализация кастомных фильтров
        if(options.customFilters.length) {
            var $filtersForm = $grid.find('.custom_filters');
            if(!$filtersForm.length) {
                $filtersForm = $('<section class="panel">' +
                    '<header class="panel-heading font-bold">Фильтры</header>' +
                    '<div class="panel-body">' +
                    '   <form class="custom_filters" role="form"></form>' +
                    '</div>' +
                '</section>');
                $grid.before($filtersForm);
                $filtersForm = $filtersForm.find('form');
                $filtersForm.addClass(options.customFiltersClass);
            }
            $filtersForm.html('');
            options.customFilters.forEach(function(cfRow, key) {
                if(cfRow.hasOwnProperty('filter')) {
                    cfRow = _.defaults(cfRow, {
                        label: '',
                        placeholder: '',
                        type: 'text',
                        value: '',
                        size: 30
                    });
                    //cfRow.filter = cfRow.filter.replace(/"|\\"/g, '\\"');
                    $filtersForm.append('<div class="form-group">' +
                        (cfRow.label != '' ? '<label class="sr-only" for="cf_'+key+'">'+ cfRow.label +'</label>' : '') +
                        '<input type="'+ cfRow.type +'" size="'+ cfRow.size +'" ' +
                        'class="form-control input-sm" id="cf_'+key+'" name=\''+cfRow.filter+'\' ' +
                        'placeholder="'+ cfRow.placeholder +'" value="'+ cfRow.value +'">' +
                        '</div> ');
                } else {
                    console.warn('Фильтр ' + key + ' не имеет названия или условия. Параметры: ', cfRow);
                }
            });
            $filtersForm.append(' <button type="submit" class="btn btn-sm btn-success">Искать</button>');
            $filtersForm.bind('submit', function(e){
                e.preventDefault();
                var formData = $filtersForm.serializeArray(),
                    filters = {};
                formData.forEach(function(dataRow, key) {
                    if(dataRow.value != '') {
                        try {
                            var filter = AristosUtils.JSON.simpleParserWithRegEx(dataRow.name.format(dataRow.value));
                            filters = _.extend(filters, filter);
                        } catch(e) {
                            console.warn('Не удалось добавить фильтр ', dataRow.name, ' к запросу: ', e);
                        }
                    }
                });
                self.setFilters(filters);
            });
        }


        //Инициализация кастомных выгрузок
        if(options.exportTasks.length) {
            var $exportsRow = $grid.find('.exports');
            if(!$exportsRow.length) {
                $exportsRow = $('<footer class="footer bg-white b-t">' +
                    '   <div class="row m-t-sm text-center-xs">' +
                    '       <div class="exports">/div>' +
                    '   </div>' +
                    '</footer>');
                $grid.after($exportsRow);
                $exportsRow = $exportsRow.find('.exports');
            }
            $exportsRow.html('');
            options.exportTasks.forEach(function(taskRow, key) {
                if(taskRow.hasOwnProperty('task') && taskRow.hasOwnProperty('name')) {
                    taskRow = _.defaults(taskRow, {
                        icon: 'fa-table',
                        task: '',
                        name: ''
                    });
                    var $taskItem = $('<button class="btn btn-sm btn-white"><i class="fa"></i> '+ taskRow.name +'</button>');
                    $taskItem.find('i').addClass(taskRow.icon);
                    $taskItem.data('task', taskRow.task);
                    $taskItem.click(function(e){
                        e.preventDefault();
                        var $btn = $(this);
                        self.exportXLS($btn.data('task'));
                    });
                    $exportsRow.append($taskItem);
                } else {
                    console.warn('Задание для экспорта ' + key + ' не имеет названия или условия. Параметры: ', taskRow);
                }
            });


        }

    };


};