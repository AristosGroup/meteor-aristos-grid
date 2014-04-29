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
                var rules = checkAccessForCollection(collectionName);


                var limit = parseInt(this.params.pagesize) || 1000,
                    page = parseInt(this.params.pagenum) || 0,
                    start = parseInt(page * limit);
                    finish = start + limit;
                //console.log('limit:',limit,  ' page:', page, ' start:', start,  ' finish:', finish);
                var filter = {},
                    options = {
                        reactive: false,
                        limit: limit,
                        skip: start
                    };
                if(this.params.limit) {
                    limit = parseInt(this.params.limit);
                    options.limit = limit;
                }
                if(this.params.searchQuery && this.params.searchQuery != '') {
                    filter['searchString'] = new RegExp(this.params.searchQuery, 'i');
                }
                if(this.params.sortdatafield && this.params.sortdatafield != '') {
                    this.params.sortdatafield = this.params.sortdatafield.replace(new RegExp('>', 'g'), '.');
                    try {
                        options.sort = {};
                        options.sort[this.params.sortdatafield] = (this.params.sortorder == 'desc' ? -1 : 1);
                    } catch (e) {
                        console.log("Can't assign sorting for query", e);
                    }
                }
                if(this.params.filterscount && parseInt(this.params.filterscount) > 0) {
                    for(var i = 0; i < this.params.filterscount; i++) {
                        var filterValue = this.params.hasOwnProperty('filtervalue'+i) ? this.params['filtervalue' + i] : '';
                        filterValue = filterValue.replace(/\+/g, ' ');
                        if(!isNaN(filterValue)) {
                            filterValue = parseFloat(filterValue);
                        } else if(moment(new Date(filterValue)).isValid()) {
                            filterValue = moment(new Date(filterValue)).toDate();
                        }

                        var filterCondition = this.params.hasOwnProperty('filtercondition'+i) ? this.params['filtercondition' + i] : 'CONTAINS';
                        var filterDataField = this.params.hasOwnProperty('filterdatafield'+i) ? this.params['filterdatafield' + i] : null;
                        filterDataField = filterDataField.replace(new RegExp('>', 'g'), '.');
                        var filterOperator = this.params.hasOwnProperty('filteroperator'+i)
                            && this.params['filteroperator' + i] == 0 ? 'AND' : 'OR';
                        if(!filterDataField) continue;
                        var filterRule;
                        switch (filterCondition) {
                            case 'EMPTY': filterRule = ''; break;
                            case 'NOT_EMPTY': filterRule = { $ne: '' }; break;
                            case 'NULL': filterRule = null; break;
                            case 'NOT_NULL': filterRule = { $ne: null }; break;
                            case 'DOES_NOT_CONTAIN': filterRule = { $not: new RegExp(filterValue, 'i') }; break;
                            case 'DOES_NOT_CONTAIN_CASE_SENSITIVE': filterRule = { $not: new RegExp(filterValue) }; break;
                            case 'EQUAL': filterRule = filterValue; break;
                            case 'EQUAL_CASE_SENSITIVE': filterRule = filterValue; break;
                            case 'NOT_EQUAL': filterRule = { $not: filterValue }; break;
                            case 'GREATER_THAN': filterRule = { $gt: filterValue }; break;
                            case 'GREATER_THAN_OR_EQUAL': filterRule = { $gte: filterValue }; break;
                            case 'LESS_THAN': filterRule = { $lt: filterValue }; break;
                            case 'LESS_THAN_OR_EQUAL': filterRule = { $lte: filterValue }; break;
                            case 'STARTS_WITH': filterRule = new RegExp('^' + filterValue, 'i'); break;
                            case 'STARTS_WITH_CASE_SENSITIVE': filterRule = new RegExp('^' + filterValue); break;
                            case 'ENDS_WITH': filterRule = new RegExp(filterValue + '$', 'i'); break;
                            case 'ENDS_WITH_CASE_SENSITIVE': filterRule = new RegExp(filterValue + '$'); break;
                            case 'CONTAINS_CASE_SENSITIVE': filterRule = new RegExp(filterValue); break;
                            case 'CONTAINS':
                            default: filterRule = new RegExp(filterValue, 'i');
                        }
                        console.log('Add Rule for '+filterDataField+': ', filterRule);
                        if(filter.hasOwnProperty(filterDataField)) {
                            if(typeof filter[filterDataField] == 'object' && filter[filterDataField].hasOwnProperty('$in')) {
                                //Добавляем в свойство $in
                                filter[filterDataField]['$in'].push(filterRule);
                            } else if(typeof filter[filterDataField] == 'object' && !(filter[filterDataField] instanceof RegExp)) {
                                //Фильтр является объектом, расширяем его
                                var extend = _.extend(filter[filterDataField], filterRule);
                                console.log('Extending filter filter['+filterDataField+']. exitst:', filter[filterDataField],
                                    ' new:', filterRule, ' extended:', extend);
                                filter[filterDataField] = extend;
                            } else {
                                var merge = { $in: [filter[filterDataField], filterRule] };
                                console.log('Merging 2 filter rules for filter['+filterDataField+']. exitst:', filter[filterDataField],
                                    ' new:', filterRule, ' merged:', merge);
                                filter[filterDataField] = merge;
                            }
                        } else {
                            try {
                                filter[filterDataField] = filterRule;
                            } catch (e) {
                                console.log("Can't assign filter for query", filterDataField, filterValue);
                            }
                        }
                    }
                }
                //Применяем основной фильтр
                if(this.params.filters && this.params.filters != '') {
                    try {
                        this.params.filters = this.params.filters.replace('+', ' ');
                        var mainFilter = AristosUtils.JSON.parse(this.params.filters);
                        filter = _.extend(filter, mainFilter);
                    } catch(e) {
                        console.log('Ошибка обработки фильтра: ', e);
                    }
                }

                console.log('Filter: ', filter, '\nOptions:', options);

                var distincts = {};
                var distinctsParams = (this.params.distincts ? this.params.distincts.split(',') : []);
                if(distinctsParams.length) {
                    _.each(distinctsParams, function(val) {
                        distincts[val] = collection.distinct(val, filter);
                    });
                }

                var query = collection.find(filter, options);
                var responseData = {
                    'limit': limit,
                    'count': query.count(),
                    'rows': query.fetch(),
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