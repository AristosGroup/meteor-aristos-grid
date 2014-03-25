Router.map(function () {
    this.route('yandexContentApijson', {
        where: 'server',
        path: '/grid/export.json',
        action: function () {
            var self = this;
            this.response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
            console.log('Request export json. Params: ', this.params);

            //Попытка распознания коллекции
            if(!this.params.collection) throw new Error('Не передана коллекция');
            var collection = this.params.collection.replace(new RegExp('[^A-Za-z0-9\-\_ ]', 'g'), '');
            var globals = Function('return this')(); //Хак для получения глобальных переменных
            if(globals.hasOwnProperty(collection) && globals[collection] instanceof Meteor.Collection) {
                collection = globals[collection];
            }
            if(typeof collection != 'object') throw new Error('Не удалось распознать коллекцию');

            var limit = parseInt(this.params.pagesize) || 1000,
                page = parseInt(this.params.pagenum) || 0,
                start = parseInt(page * limit),
                finish = start + limit;
            console.log('limit:',limit,  ' page:', page, ' start:', start,  ' finish:', finish);
            var filter = {},
                options = {};
            if(this.params.searchQuery && this.params.searchQuery != '') {
                filter['main.model.name'] = new RegExp(this.params.searchQuery, 'i');
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
                    if(!isNaN(filterValue)) {
                        filterValue = parseFloat(filterValue);
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
                        if(typeof filter[filterDataField] == 'object' &&  !(filter[filterDataField] instanceof RegExp)) {
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
                    var mainFilter = AristosUtils.JSON.parse(this.params.filters);
                    /*if(mainFilter.hasOwnProperty('$and') && typeof mainFilter['$and'] == 'object') {
                        _.each(mainFilter['$and'], function(val, key) {
                            console.log('val:', val);
                            if(typeof val == 'object') {
                                _.each(val, function(valValue, valKey) {
                                    if(typeof valValue == 'string' && valValue.indexOf('/') === 0) {
                                        val[valKey] = RegExp.apply(undefined, /^\/(.*)\/(.*)/.exec(valValue).slice(1));
                                        console.log('found regexp: ', valValue, val[valKey]);
                                    }
                                });
                                console.log('val:', val);
                                mainFilter['$and'][key] = val;
                            }
                        });
                    }*/
                    //console.log('Added main filter: ', this.params.filters, mainFilter);
                    filter = _.extend(filter, mainFilter);
                } catch(e) {
                    console.log('Ошибка обработки фильтра: ', e);
                }
            }

            console.log('Filter: ', filter, '\nOptions:', options);
            var query = collection.find(filter, options).fetch();
            var responseData = {
                'limit': limit,
                'count': query.length,
                'rows': query.slice(start, finish)
            };
            this.response.end(JSON.stringify(responseData));
        }
    });
});