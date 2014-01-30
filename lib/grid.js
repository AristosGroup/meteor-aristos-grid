Meteor.ReportGrid = function (collection, options) {
    var self = this;
    this.name = options.name;
    this.collection = collection;
    this.ready = false;

    // this.gridFields = options.gridFields;

    /* this.metaCollectionName = self.name + 'Meta';
     this.collectionMeta = new Meteor.Collection(this.metaCollectionName);
     */

    this.statesCollectionName = self.name + 'States';
    this.collectionStates = new Meteor.Collection(this.statesCollectionName);


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

    this.mode = {
        dep: new Deps.Dependency,   //save dependent computations here

        limit: options.limit,
        skip: 0,
        filters: options.filters,
        sort: options.sort,
        getLimit: function () {
            this.dep.depend();  //saves the Deps.currentComputation
            return this.limit;
        },
        getSkip: function () {
            this.dep.depend();
            return this.skip;
        },
        setLimit: function (newValue) {
            if (newValue !== this.limit) {
                this.limit = newValue;
                Session.set('ready', false);
                this.dep.changed();  //invalidates all dependent computations

            }
            return this.limit;

        },

        getFilters: function () {
            this.dep.depend();
            return this.filters;
        },
        setFilters: function (newValue) {
            if (newValue !== this.filters) {
                this.filters = newValue;
                Session.set('ready', false);

                this.dep.changed();

            }
            return this.filters;

        },

        getSort: function () {
            this.dep.depend();
            return this.sort;
        },
        setSort: function (newValue) {
            if (newValue !== this.sort) {
                this.sort = newValue;
                Session.set('ready', false);

                this.dep.changed();

            }
            return this.sort;

        }
    };


    if (Meteor.isServer)
        this.server();

    if (Meteor.isClient) {

        self.client();

    }
};

/*Meteor.ReportGrid.prototype._prepareCols = function(doc){
 this.gridFields.forEach (function(fieldOptions){
 if(doc[fieldOptions.key])
 {

 }
 });
 };*/

Meteor.ReportGrid.prototype.server = function () {
    var self = this;

    Meteor.publish(this.name, function (options) {
        return self.collection.find(options.filters, {limit: options.limit, sort: options.sort, skip: options.skip});
    });

    Meteor.publish(this.statesCollectionName, function () {
        return self.collectionStates.find();
    });
    /*
     Meteor.publish(this.metaCollectionName, function (options) {
     var pub = this;


     var filters = options.filters ? options.filters : {};

     //var self = this;
     var uuid = Meteor.uuid();
     var count = 0;
     var cols = [];
     var initializing = true;

     var handle = self.collection.find(filters).observeChanges({
     added: function (doc, idx) {
     count++;
     //cols.push(self._prepareCols(doc));
     if (!initializing)
     pub.changed(self.metaCollectionName, uuid, {count: count});
     },
     removed: function (doc, idx) {
     count--;
     pub.changed(self.metaCollectionName, uuid, {count: count});
     }
     // don't care about moved or changed
     });


     initializing = false;

     // publish the initial count.  observeChanges guaranteed not to return
     // until the initial set of `added` callbacks have run, so the `count`
     // variable is up to date.
     pub.added(self.metaCollectionName, uuid, {filters: filters, count: count});

     // and signal that the initial document set is now available on the client
     pub.ready();

     // turn off observe when client unsubs
     pub.onStop(function () {
     handle.stop();
     });


     });

     */


};


Meteor.ReportGrid.prototype.subscribe=function(){
    var self = this;

    return [
        Meteor.subscribe(this.statesCollectionName),
        Meteor.subscribe(self.name, {filters: self.mode.getFilters(), limit: self.mode.getLimit(), skip: self.mode.getSkip(), sort: self.mode.getSort()})
    ];
};

Meteor.ReportGrid.prototype.client = function () {
    var self = this;


 /*   Meteor.subscribe(this.statesCollectionName);


    Deps.autorun(function () {
        var sub = Meteor.subscribe(self.name, {filters: self.mode.getFilters(), limit: self.mode.getLimit(), skip: self.mode.getSkip(), sort: self.mode.getSort()});

        if (sub.ready()) {
            Session.set('ready', true);

            console.log(self.name + ' ready');
            //console.log(self.collection.find().count());

        }


    });*/

    //meta deps
    /*  Deps.autorun(function () {
     var subMeta = Meteor.subscribe(self.metaCollectionName, {filters: self.mode.getFilters()});

     if (subMeta.ready()) {
     // console.log(self.collectionMeta.find().fetch());

     }

     });*/


};

Meteor.ReportGrid.prototype.states = function () {
    return this.collectionStates;
};

Meteor.ReportGrid.prototype.setState = function (stateId) {
    console.log(stateId);
    Session.set(this.name + 'stateId', stateId);
};


Meteor.ReportGrid.prototype.isReady = function () {
    return this.ready;
};

Meteor.ReportGrid.prototype.meta = function () {
    return this.collectionMeta;
};


Meteor.ReportGrid.prototype.render = function (options) {

    Deps.autorun(function () {

    });

    var self = this;


    Template[options.template].helpers({

        states: function () {
            return self.collectionStates.find();
        }
    });


    Template[options.template].rendered = function () {

        //save states
        if (options.saveStateButton) {
            $(options.saveStateButton).on('click', function (e) {
                e.preventDefault();

                bootbox.prompt("Save current state", function (statename) {
                    if (statename === null) {

                    } else {
                        var savedState = $(options.renderTo).jqxGrid('savestate');

                        self.collectionStates.insert({name: statename, state: savedState});

                    }
                });

            });

        }


        //render grid
       // if (Session.get('ready')) {

            var datafields = _.map(options.gridFields, function (opt) {
                return  _.pick(opt, 'name', 'type', 'map');
            });


            var columns =[];

        options.gridFields.forEach(function(opt) {
            opt.text = opt.label;
            opt.dataField = opt.name;
            opt=  _.pick(opt, 'text', 'dataField', 'width', 'cellsformat', 'aggregates', 'pinned', 'cellsalign', 'cellsrenderer', 'filtertype', 'renderer');
            columns.push(opt);

        });


            var source = {};
            var rows = null;
            Deps.autorun(function () {
              //  if (Session.get('ready')) {
                    // var state = $(options.renderTo).jqxGrid('savestate');

                    rows = self.collection.find({}, {sort: self.mode.getSort()}).fetch();

                    source.localdata = rows;
                    // passing "cells" to the 'updatebounddata' method will refresh only the cells values when the new rows count is equal to the previous rows count.
                    $(options.renderTo).jqxGrid('updatebounddata');
                    $(options.renderTo).jqxGrid('autoresizecolumns');


                    // $(options.renderTo).jqxGrid('loadstate', state);


             //   }
            });


            source =
            {

                localdata: rows,
                datatype: "array",
                datafields: datafields
                /*     sort: function (column, direction) {

                 console.log(direction);
                 var s = {};
                 s[column] = direction ? 1 : -1;
                 self.mode.setSort(s);
                 },

                 filter: function (filters, recordsArray) {

                 console.log(filters[0].filter.getfilters());
                 ///console.log(recordsArray);
                 },

                 pager: function (pagenum, pagesize, oldpagenum) {

                 },

                 addrow: function (rowid, rowdata, position, commit) {
                 // synchronize with the server - send insert command
                 // call commit with parameter true if the synchronization with the server is successful
                 //and with parameter false if the synchronization failed.
                 // you can pass additional argument to the commit callback which represents the new ID if it is generated from a DB.
                 commit(true);
                 },
                 deleterow: function (rowid, commit) {
                 // synchronize with the server - send delete command
                 // call commit with parameter true if the synchronization with the server is successful
                 //and with parameter false if the synchronization failed.
                 commit(true);
                 },
                 updaterow: function (rowid, newdata, commit) {
                 // synchronize with the server - send update command
                 // call commit with parameter true if the synchronization with the server is successful
                 // and with parameter false if the synchronization failed.
                 commit(true);
                 }*/

            };


            var dataAdapter = new $.jqx.dataAdapter(source, {

            });

            var gridOptions = {
                theme: 'arctic',
                width: '1000',
                height: '600',
                rowsheight: 40,
                source: dataAdapter,
                scrollmode: 'deferred',
                deferreddatafields: ['modelName'],

                sortable: true,
                groupable: true,
                filterable: true,
                showfilterrow: true,
                ready: function () {
                    //addfilter();
                },
                autoshowfiltericon: true,
                //    virtualmode: true,
                /*       rendergridrows: function () {
                 return dataAdapter.records;
                 },*/
                pageable: true,
                pagesizeoptions: [50, 100, 200, 400],
                pagesize: 50,
                autoheight: true,
                columnsresize: true,

                showaggregates: true,
                showstatusbar: true,
                autoloadstate: true,
                autosavestate: true,
                statusbarheight: 50,
                columns: columns

            };

            // if (options.gridOptions)
            //  gridOptions = _.extend(gridOptions, options.gridOptions);


            $(options.renderTo).jqxGrid(gridOptions);


     //   }


        Deps.autorun(function () {
            var stateId = Session.get(self.name + 'stateId');

            if (stateId) {
                console.log(stateId);
                var newstate = self.collectionStates.findOne(stateId);
                $(options.renderTo).jqxGrid('loadstate', newstate.state);
            }
        });


    };


};