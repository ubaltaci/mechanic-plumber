/**
 *
 * Created by uur on 18/11/14.
 */
var _ = require("lodash");
var Clc = require("cli-color");
var Inflection = require("inflection");
var MechanicError = require("mechanic-error");

var pre = [];

module.exports = function (route, blueprintName, Controllers, controllerName) {

    pre = [];

    var path = route.path;
    // remove falsy values
    var items = _.compact(path.split("/"));

    // remove manager prefix
    if (items.indexOf("manager") != -1) {
        items.splice(items.indexOf("manager"), 1);
    }

    if (items.length > 1 && items.length < 3) {
        console.log(Clc.red.bold("Route path does not conform with blueprint configuration -> " + path));
        process.exit(1);
    }

    var modelName;

    if (items.length == 1) {
        modelName = _getModelNameFromPath(items[0]);

        if (!modelName || !mechanic.models[modelName]) {
            console.log(Clc.red.bold("Related model file not found for controller -> " + controllerName));
            process.exit(1);
        }

        if (blueprintName == "index") {
            blueprintGetAll(modelName, {}, items[0]);
        }

        if (blueprintName == "edit" || blueprintName == "update") {
            blueprintGetOne(modelName, Inflection.singularize(items[0]) + "id", Inflection.singularize(items[0]));
        }
        if (blueprintName == "delete") {
            blueprintRemoveOne(modelName, Inflection.singularize(items[0]) + "id", Inflection.singularize(items[0]));
        }
    }
    else {
        var lastIndex = items.length - 1;
        var parentModelName = _getModelNameFromPath(items[lastIndex - 2]);
        var childModelName = _getModelNameFromPath(items[lastIndex]);
        if (!childModelName || !mechanic.models[childModelName]) {
            console.log(Clc.red.bold("Related model file not found for path -> " + items[lastIndex]));
            process.exit(1);
        }
        if (!parentModelName || !mechanic.models[parentModelName]) {
            console.log(Clc.red.bold("Related model file not found for path -> " + items[lastIndex - 2]));
            process.exit(1);
        }
        var relationFields = _getSchemaItemName(childModelName, parentModelName);
        console.log(relationFields);
    }
    return pre;

};

function _getModelNameFromPath(pathName) {
    var str = Inflection.singularize(pathName);
    return str && str[0].toLocaleUpperCase() + str.slice(1).toLocaleLowerCase();
}

function _getSchemaItemName(childModelName, parentModelName) {

    var result = {};

    var schema = mechanic.models[childModelName]["schema"];
    var name = __traverseSchema(schema.tree, parentModelName, "parent");
    var expectedName = childModelName.toLocaleLowerCase() + "_" + parentModelName.toLocaleLowerCase() + "id";

    if (expectedName != name) {
        console.log(Clc.red.bold("Relation defined in blueprint but schema item -> " + expectedName + " not found in " + childModelName + " model. (maybe typo mistake? I found " + name + ")"));
        process.exit(1);
    }

    if (!name) {
        console.log(Clc.red.bold("Relation defined in blueprint but schema item -> " + expectedName + " not found in " + childModelName + " model."));
        process.exit(1);
    }
    
    result["child"] = name;

    schema = mechanic.models[parentModelName]["schema"];
    name = __traverseSchema(schema.tree, childModelName, "child");
    expectedName = parentModelName.toLocaleLowerCase() + "_" + childModelName.toLocaleLowerCase() + "ids";

    if (expectedName != name) {
        console.log(Clc.red.bold("Relation defined in blueprint but schema item -> " + expectedName + " not found in " + parentModelName + " model. (maybe typo mistake? I found " + name + ")"));
        process.exit(1);
    }

    if (!name) {
        console.log(Clc.red.bold("Relation defined in blueprint but schema item -> " + expectedName + " not found in " + parentModelName + " model."));
        process.exit(1);
    }

    result["parent"] = name;

    return result;
}

function __traverseSchema(tree, refName, relation) {
    var name = null;
    Object.keys(tree).forEach(function (schemaItem) {

        if (relation == "parent") {
            if (tree[schemaItem].type == mechanic.db.mongoose.SchemaTypes.ObjectId
                && schemaItem != "id"
                && schemaItem != "_id"
                && tree[schemaItem].ref == refName) {
                name = schemaItem;

            }
        }
        else if (relation == "child") {
            if (tree[schemaItem] && tree[schemaItem].constructor === Array
                && schemaItem != "id"
                && schemaItem != "_id"
                && tree[schemaItem][0]
                && tree[schemaItem][0].ref == refName) {
                name = schemaItem;
            }
        }
    });
    return name;
}

function blueprintGetAll(modelName, param, assign) {
    var method = function (request, reply) {
        mechanic.models[modelName].getAll(param, function (errors, instances) {
            if (errors) {
                request.session.flash("error", {"main": errors});
                return reply(new MechanicError("MongooseError", errors));
            }

            return reply(instances);
        });

    };
    pre.push({method: method, assign: assign});
}

function blueprintGetOne(modelName, param, assign) {
    var method = function (request, reply) {
        mechanic.models[modelName].getOne({
            "_id": request.params[param]
        }, function (errors, instance) {
            if (errors) {
                request.session.flash("error", {"main": errors});
                return reply(new MechanicError("MongooseError", errors));
            }
            return reply(instance);
        });
    };
    pre.push({method: method, assign: assign});
}

function blueprintRemoveOne(modelName, param, assign) {
    var method = function (request, reply) {
        mechanic.models[modelName].removeOne({
            "_id": request.params[param]
        }, function (errors, instance) {
            if (errors) {
                request.session.flash("error", {"main": errors});
                return reply(new MechanicError("MongooseError", errors));
            }
            return reply(instance);
        });
    };
    pre.push({method: method, assign: assign});
}

