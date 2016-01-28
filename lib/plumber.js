/**
 *
 * Created by uur on 25/06/14.
 */

"use strict";

const Fs = require("fs");
const Path = require("path");
const _ = require("lodash");
const Callsite = require("callsite");
const Clc = require("cli-color");

const Payload = require("./payload");
const BlueprintRoutes = require("./blueprint_routes");

let PluginPaths = {};

// Controller files key - require
let Controllers = {};

// Controller files key - require
let PreHooks = [];

// Routes.js
let Routes = [];

// URL_PATH -> {method, path, config}
let HapiRoutes = {};

let Plugin;
let PluginName;
let Config;

module.exports = {
    pipe: _pipe,
    pipeModels: _pipeModels,
    pipeServices: _pipeServices,
    pipeHooks: _pipeHooks
};

/**
 * Pipe hooks directory into mechanic.hooks
 * object for further usage.
 * Each file exports a single object {availableAfter, fn(request, reply), assign}
 * @returns {[]}
 * @private
 */
function _pipeHooks(hookFilePath) {

    hookFilePath = hookFilePath || "hooks/hooks.js";
    const stack = Callsite();
    const requester = stack[1].getFileName();
    const mainHookFilePath = Path.join(Path.dirname(requester), hookFilePath);

    let hooks = [];

    try {

        const stat = Fs.statSync(mainHookFilePath);
        if (stat.isFile()) {
            hooks = require(mainHookFilePath);
        }
    }
    catch (e) {
        console.log(Clc.red.bold(e));
    }

    if (hooks.length == 0) {
        console.log(Clc.red.bold("Upps. There are not any HOOKS, I guess you're busy with something else :( kib bb"));
    }

    return hooks;
}

/**
 * Pipe Service directory into mechanic.service
 * object for further usage.
 * Each file exports a single function
 * @returns {{}}
 * @private
 */
function _pipeServices(serviceDirectory) {

    serviceDirectory = serviceDirectory || "services";

    const services = {};
    const stack = Callsite();
    const requester = stack[1].getFileName();

    const mainServiceFolder = Path.join(Path.dirname(requester), serviceDirectory);

    try {
        const stat = Fs.statSync(mainServiceFolder);
        if (!stat.isDirectory()) {
            return services;
        }
    }
    catch (e) {
        console.log(Clc.red.bold("Upps. There are not any SERVICES, I guess you're busy with something else :( kib bb"));
        return {};
    }

    const serviceItems = _readDirectoryRecursively(mainServiceFolder, _filterJavascriptFile);

    for (let serviceItem of serviceItems) {

        if (!serviceItem.path) {
            continue;
        }

        // Nested services!
        const relativePath = Path.relative(mainServiceFolder, serviceItem.path);
        let splittedPath = relativePath.split(Path.sep);

        let lastServices = services;

        for (let i = 0; i < splittedPath.length; i++) {

            if (i == splittedPath.length - 1) {
                // !file name
                lastServices[_trimExtFromFileName(serviceItem.name)] = require(serviceItem.path);
                break;
            }

            lastServices[splittedPath[i]] = lastServices[splittedPath[i]] || {};
            lastServices = lastServices[splittedPath[i]];
        }
    }

    return services;
}

/**
 *
 * @returns {{}}
 * @private
 */
function _pipeModels() {

    const models = {};

    const stack = Callsite();
    const requester = stack[1].getFileName();
    const mainPluginFolder = Path.join(Path.dirname(requester), "plugins");

    const pluginFolders = Fs.readdirSync(mainPluginFolder);

    pluginFolders.forEach(function (pluginFolder) {
        pluginFolder = Path.join(mainPluginFolder, pluginFolder);

        if (Fs.existsSync(pluginFolder)) {
            const stat = Fs.statSync(pluginFolder);
            if (stat.isDirectory()) {
                const modelFolder = Path.join(pluginFolder, "model");
                if (Fs.existsSync(modelFolder)) {
                    const stat2 = Fs.statSync(modelFolder);
                    if (stat2.isDirectory()) {
                        _.extend(models, _pipeModelsInFolder(modelFolder));
                    }
                }
            }
        }
    });

    return models;
}

/**
 * Promise for returning all model files.
 * @param {string} folder
 * @return {object}
 */
function _pipeModelsInFolder(folder) {

    const pluginModels = {};
    const modelFsItems = _readDirectoryRecursively(folder, _filterJavascriptFile);

    modelFsItems.forEach(function (modelFsItem) {
        pluginModels[_getModelName(modelFsItem.name)] = require(modelFsItem.path);
    });

    return pluginModels;
}

/**
 * Get model name from filename
 * @param fileName
 * @return {string} modelName
 */
function _getModelName(fileName) {

    let filename = _trimExtFromFileName(fileName).toLocaleLowerCase();
    const frags = filename.split("_");
    for (let i = 0; i < frags.length; i++) {
        frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    filename = frags.join("");

    return filename.charAt(0).toLocaleUpperCase() + filename.slice(1);
}

/**
 * Anything ends with *.js
 * @param fsItem
 * @return {boolean}
 */
function _filterJavascriptFile(fsItem) {

    return /(.*)\.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

function _pipe(plugin, preHooks, config) {

    if (!plugin) {
        console.log(Clc.red.bold("Pipe's first and only argument must be plugin itself"));
        process.exit(1);
    }

    if (!preHooks || preHooks.length == 0) {
        console.log(Clc.red.bold("Are you sure ? You do not pass any pre hook to this plugin."));
    }

    Plugin = plugin;
    Config = config;
    PreHooks = preHooks;

    PluginPaths = {};
    Controllers = {};
    Routes = [];
    HapiRoutes = {};

    const stack = Callsite();
    const requester = stack[1].getFileName();

    PluginPaths.mainPath = Path.dirname(requester);
    PluginPaths.mainFile = Path.basename(requester);
    PluginName = _trimExtFromFileName(PluginPaths.mainFile);

    _setPluginPaths();

    if (PluginPaths.routeFile) {
        Routes = require(PluginPaths.routeFile);
    }

    if (PluginPaths.controllerDirectory) {
        _pipeControllers();
    }
}

/**
 * Set plugin paths.
 * @private
 */
function _setPluginPaths() {

    // trim .js from filename
    const mainFileName = _trimExtFromFileName(PluginPaths.mainFile);
    // Set *_routes.js
    PluginPaths.routeFile = Path.join(PluginPaths.mainPath, mainFileName + "_routes.js");

    // Set controller directory
    PluginPaths.controllerDirectory = Path.join(PluginPaths.mainPath, "controller");

    if (!Fs.existsSync(PluginPaths.routeFile) || !Fs.statSync(PluginPaths.routeFile).isFile()) {
        PluginPaths.routeFile = null;
    }

    if (!Fs.existsSync(PluginPaths.controllerDirectory) || !Fs.statSync(PluginPaths.controllerDirectory).isDirectory()) {
        PluginPaths.controllerDirectory = null;
    }
}

/**
 * Pipe Controller files.
 * @private
 */
function _pipeControllers() {

    // Recursively read controllerDirectory
    const fsItems = _readDirectoryRecursively(PluginPaths.controllerDirectory, _filterControllerFile);
    fsItems.forEach((fsItem) => {
        Controllers[_trimExtFromFileName(fsItem.name)] = require(fsItem.path);
    });

    // 1. routes.js top presendence can not be overriden.
    _pipeRoutesJsIntoRoutes();

    // 2. _pipeControllersIntoRoutes();

    // 3. pipe HapiRoutes into Hapi! Yey!
    _pipeAllIntoHapi();
}

/**
 * Pipe routes defined in routes.js into HapiRoutes
 * @return {Object}
 * @private
 */
function _pipeRoutesJsIntoRoutes() {

    let controllerName;
    let controllerAction;
    let relatedController;
    let relatedAction;

    Routes.forEach((route) => {

        if (HapiRoutes[route.path] && HapiRoutes[route.path]["method"] === route.method) {
            throw new Error("URL path ( " + route.path + " | " + HapiRoutes[route.path]["method"] + " ) defined more than one in routes.js");
        }

        const config = route.config;
        if ((typeof config == "string" || config instanceof String) && config.indexOf("@") > 0) {
            // config just contain handler.
            controllerName = config.split("@")[0].trim();
            controllerAction = config.split("@")[1].trim();

            relatedController = Controllers[controllerName];
            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found");
            }

            relatedAction = relatedController[controllerAction];
            //// Plug & Play with /
            if (typeof relatedAction == "function") {
                relatedAction = {
                    handler: relatedController[controllerAction]
                };
            }
            if (!relatedAction) {
                throw new Error("Controller action -> " + controllerAction + " : ( " + controllerAction + "@" + controllerName + " ) defined in routes.js not found in " + controllerName);
            }

            // Controller and Action found added!
            HapiRoutes[route.path + "@" + route.method] = {
                method: route.method,
                path: route.path || "GET",
                config: relatedAction
            };
        }
        else { // default blueprint if not contain `@`

            controllerName = config.trim();
            relatedController = Controllers[controllerName];

            if (!relatedController) {
                throw new Error("Controller : ( " + controllerName + ".js ) not found defined in routes.js");
            }

            Object.keys(BlueprintRoutes).forEach((blueprintRoute) => {

                const idParameter = controllerName.substr(0, controllerName.indexOf("_controller")).toLocaleLowerCase();

                const path = route.path + BlueprintRoutes[blueprintRoute].path.replace("{id}", "{" + idParameter + "id}");

                const method = BlueprintRoutes[blueprintRoute].method;

                if (route.except && route.except.indexOf(blueprintRoute) >= 0) {
                    ;//do nothing
                }
                else if (!relatedController[blueprintRoute] && ((blueprintRoute === "sorting") || (blueprintRoute === "sorted") || (blueprintRoute === "delete-info") || (blueprintRoute === "update-info"))) {
                    ;//do nothing
                }
                else if (!relatedController[blueprintRoute]) {
                    console.log("Controller : ( " + controllerName + ".js ) defined as a blueprint in routes.js but " + blueprintRoute + " not found in controller file");
                }
                else {
                    //// Plug & Play with /
                    if (typeof relatedController[blueprintRoute] == "function") {
                        relatedController[blueprintRoute] = {
                            handler: relatedController[blueprintRoute]
                        };
                    }

                    if (!relatedController[blueprintRoute].payload && Payload(blueprintRoute)) {
                        relatedController[blueprintRoute].payload = Payload(blueprintRoute);
                    }

                    if (!relatedController[blueprintRoute].payload && Payload(blueprintRoute)) {
                        relatedController[blueprintRoute].payload = Payload(blueprintRoute);
                    }

                    // Controller and Action found added!
                    HapiRoutes[path + "@" + method] = {
                        method: method,
                        path: path,
                        config: relatedController[blueprintRoute]
                    };
                }
            });
        }
    });

    return HapiRoutes;
}

/**
 * *.js -> *
 * @param fileName
 * @return {string}
 * @private
 */
function _trimExtFromFileName(fileName) {
    return fileName && fileName.split(".")[0];
}

/**
 * Anything ends with *Controller.js under "controller" folder.
 * @param fsItem
 * @return {boolean}
 * @private
 */
function _filterControllerFile(fsItem) {
    return /(.*)_controller.js$/.test(fsItem.name) && !fsItem.stat.isDirectory() && fsItem.name[0] !== "_";
}

/**
 * Pipe all routes into plugin
 * @private
 */
function _pipeAllIntoHapi() {

    const routeKeys = Object.keys(HapiRoutes);

    routeKeys.forEach((routeKey) => {

        if (PreHooks) {

            HapiRoutes[routeKey].config.pre = [];

            for (let i = PreHooks.length - 1; i >= 0; i--) {

                const pre = PreHooks[i];

                if (pre.plugins && pre.plugins.indexOf(PluginName) == -1) {
                    continue;
                }

                if (pre["availableAfter"] && HapiRoutes[routeKey].path.indexOf(pre["availableAfter"]) == 0) {

                    if (!HapiRoutes[routeKey].config.pre) {
                        HapiRoutes[routeKey].config.pre = [];
                    }

                    HapiRoutes[routeKey].config.pre.unshift({
                        method: pre.method,
                        assign: pre.assign
                    });
                }
            }
        }

        Plugin.route({
            path: HapiRoutes[routeKey].path,
            method: HapiRoutes[routeKey].method ? HapiRoutes[routeKey].method : "GET",
            config: HapiRoutes[routeKey].config
        });
    });
}

/**
 * Read files in a directory recursively
 * Filter function used filter necessary components
 *
 * @param {string} directoryPath
 * @param {function} filterFunc
 * @returns {object} FsItems
 * @private
 */

function _readDirectoryRecursively(directoryPath, filterFunc) {

    let container = [];
    const items = Fs.readdirSync(directoryPath);

    items.forEach((item) => {
        const path = Path.join(directoryPath, item);
        const stat = Fs.statSync(path);

        if (stat.isDirectory()) {
            container = container.concat(_readDirectoryRecursively(path, filterFunc));
        }
        else {
            const fsItem = {
                path: path,
                stat: stat,
                name: item
            };

            if (filterFunc(fsItem)) {
                container.push(fsItem);
            }
        }
    });

    return container;
}
