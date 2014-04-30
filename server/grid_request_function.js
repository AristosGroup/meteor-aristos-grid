checkAccessForCollection = function(collectionName) {
    //Требуеся указать сабмодули, которые имеют доступ к данной коллекции
    var moduleAccess = [];
    switch (collectionName) {
        case 'YandexCollection':
            moduleAccess.push({
                module: 'yandex',
                submodule: 'yandex_models'
            });
            moduleAccess.push({
                module: 'yandex',
                submodule: 'yandex_api'
            });
            break;
        case 'ShopUsers':
            moduleAccess.push({
                module: 'shop',
                submodule: 'shop_users'
            });
            break;
        default: throw new Error('Коллекция ' + collectionName + ' недоступна для вывода');
    }
    var hasAccess = false;
    for(var i in moduleAccess) {
        if(moduleAccess.hasOwnProperty(i)) {
            var mod = moduleAccess[i];
            if(App.modules[mod.module].checkAccess(mod.submodule, Aristos.currentUserId)) {
                hasAccess = true;
                return mod;
            }
        }
    }
    if(!hasAccess) throw new Error('У вас нет доступа к данным ' + collectionName + '');
    return false;
}

parseFilters = function(params, limit) {
    limit = 1;
}