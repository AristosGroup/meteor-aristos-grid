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
        mode: 'local', //Режим работы с данными. local - работа с целой коллекцией локально, server - фильтрация и сортировка на стороне сервера,
        saveState: true //Фунционал по сохранению фильтров
    });

    this.options = options;
    this.name = options.name;
    this.collection = collection;
    this.ready = false;
    this.columns = options.columns;
    this.dep = new Deps.Dependency;

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
            self.render();
        });
    }
};

Meteor.ReportGrid.prototype.server = function () {
    var self = this;

    if(self.options.mode != 'server') {
        //console.log('Publishing ' + this.name + '');
        Meteor.publish(this.name, function (options) {
            //console.log('Requesting published collection with options: ', options);
            //return self.collection.find(options.filters, {fields: options.selectFields});
            //Публикуем коллекцию целиком чтобы иметь возможность применять фильтры динамически
            return self.collection.find();
        });
    }

    Meteor.publish(this.statesCollectionName, function () {
        return self.collectionStates.find();
    });
};


Meteor.ReportGrid.prototype.subscribe = function () {
    var self = this;
    var res = [];
    res.push(Meteor.subscribe(this.statesCollectionName));
    /*if(self.options.mode != 'server')
        res.push(Meteor.subscribe(self.name,
            {
                selectFields: self.selectFields,
                filters: self.options.filters,
                limit: self.options.limit,
                skip: self.options.skip,
                sort: self.options.sort
            }));*/
    return res;
};

Meteor.ReportGrid.prototype.setFilters = function (filters) {
    this.options.filters = filters;
    this.dep.changed();
}

Meteor.ReportGrid.prototype.setState = function (stateId) {
    Session.set(this.name + 'stateId', stateId);
};

Meteor.ReportGrid.prototype.states = function () {
    return this.collectionStates;
};

Meteor.ReportGrid.prototype.setState = function (stateId) {
    Session.set(this.name + 'stateId', stateId);
};

Meteor.ReportGrid.prototype.meta = function () {
    return this.collectionMeta;
};

Meteor.ReportGrid.prototype.render = function () {

    var self = this,
        options = this.options;

    //Зависимость подписки на коллекцию
    Deps.autorun(function () {
        console.log('Grid subscription renew');
        self.dep.depend();
        Meteor.subscribe(self.name,
            {
                selectFields: self.selectFields,
                filters: self.options.filters,
                limit: self.options.limit,
                skip: self.options.skip,
                sort: self.options.sort
            });
    });

    Template['gridStates'].helpers({
        states: function () {
            return self.collectionStates.find();
        }
    });

    Template[options.template].rendered = function () {

        var columns = [];
        var datafields = [];
        for (var c in self.columns) {
            if(!self.columns.hasOwnProperty(c)) continue;
            var opt = self.columns[c];
            opt.name = opt.map; //Требуется, чтобы название поля равнялось маппингу для дальнейшей фильтрации на сервере
            if(!opt.type) opt.type = 'string';
            if(!opt.filtertype) {
                switch (opt.type) {
                    case 'int':
                    case 'float':
                        opt.filtertype = 'number';
                        break;
                }
            }
            if(!opt.label) opt.label = opt.map.substr(opt.map.lastIndexOf('.') + 1);
            if(!opt.text && opt.label) opt.text = opt.label;
            opt.dataField = opt.name;
            datafields.push(_.pick(opt, 'name', 'type', 'map'));
            columns.push(_.pick(opt, 'text', 'dataField', 'width', 'cellsformat', 'aggregates', 'pinned', 'cellsalign', 'cellsrenderer', 'filtertype', 'renderer'));
        }

        var source = {};

        var getValueForPosition = function(position, obj) {
            var subkey, subkeys = position.split("."), current = obj;
            for (var i = 0, ln = subkeys.length; i < ln; i++) {
                subkey = subkeys[i];
                current = current[subkey];
                if (!_.isArray(current) && !_.isObject(current) && i < ln - 1) {
                    return;
                }
            }
            return current;
        };
        var updateBoundData = function(type) {
            $(options.renderTo).jqxGrid('updatebounddata', type);
        };
        if(options.mode == 'server') {
            source = {
                datatype: "json",
                datafields: datafields,
                async: true,
                url: "/grid/export.json",
                data: {
                    collection: self.collection,
                    filters: AristosUtils.JSON.stringify(options.filters)
                    //filters: JSON.stringify(options.filters)
                },
                root: 'rows',
                totalrecords: 0,
                beforeprocessing: function (data) {
                    //console.log('Data From Server:', data);
                    source.totalrecords = data.count;
                },
                sort: function(){ updateBoundData('sort'); },
                filter: function() { updateBoundData('filter'); }
            }
        } else {
            var rows = null;

            //Зависимость от изменений коллекции
            Deps.autorun(function () {
                console.log('Grid collection data changed');
                rows = self.collection.find(self.options.filters, {fields: self.options.selectFields, sort: self.options.sort }).fetch();
                source.localdata = rows;
                $(options.renderTo).jqxGrid('updatebounddata');
                $(options.renderTo).jqxGrid('autoresizecolumns');
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
                        var val = getValueForPosition(opt.map, item);
                        if (opt.type == 'float') {
                            val = parseFloat(val);
                        } else if (opt.type == 'int') {
                            val = parseInt(val);
                        }
                        row[opt.name] = val;
                    });
                    rows.push(row);
                });
                return rows;
            }
        });
        var gridOptions = _.extend(options.gridOptions, {
            theme: 'arctic',
            width: '100%',
            //height: '100%',
            autoheight: true,
            //rowsheight: 40,
            source: dataAdapter,
            sortable: true,
            groupable: true,
            filterable: true,
            showfilterrow: false,
            autoshowfiltericon: true,
            pageable: true,
            pagesize: 10,
            pagesizeoptions: [10, 50, 100, 200, 400, 1000, 10000],
            columnsresize: true,
            showaggregates: true,
            showstatusbar: true,
            //autoloadstate: true,
            //autosavestate: true,
            statusbarheight: 50,
            columns: columns
        });
        if(options.saveState) {
            gridOptions.showtoolbar = true;
            gridOptions.rendertoolbar = function (toolbar) {
                var me = this;
                var $container = $("<div style='margin: 5px;'></div>"),
                    $btnSaveState = $('<button href="#" id="btnGridSaveState"><i class="fa fa-plus"></i> Сохранить фильтры</button> '),
                    $btnResetState = $('<button href="#" id="btnGridResetState"><i class="fa fa-minus"></i> Сбросить текущие фильтры</button> ');
                toolbar.append($container);
                $container.append($btnSaveState, $btnResetState);
                $btnSaveState.on('click', function (e) {
                    e.preventDefault();
                    bootbox.prompt("Сохранить набор фильтров", function (statename) {
                        if (statename === null) {
                        } else {
                            var savedState = $(options.renderTo).jqxGrid('savestate');
                            savedState = self.escapeState(savedState);
                            console.log('Saving state: ', savedState);
                            self.collectionStates.insert({name: statename, state: savedState});
                        }
                    });
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
                autosavestate: false
            });
        }
        //console.log('grid options: ', gridOptions, ' columns: ', columns, ' datafields: ', datafields);
        $(options.renderTo).jqxGrid(gridOptions);

        Deps.autorun(function () {
            var stateId = Session.get(self.name + 'stateId');
            if (stateId) {
                var newstate = self.collectionStates.findOne(stateId);
                if(newstate) {
                    newstate.state = self.escapeState(newstate.state, true);
                    console.log('Loading state: ', newstate);
                    $(options.renderTo).jqxGrid('loadstate', newstate.state);
                } else {
                    console.warn('Набора фильтров с id '+stateId+' не существует');
                }
            }
        });

    };


};