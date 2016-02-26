/**
 *
 * @param {object} request
 * @param {object} request.yar - yar.
 * @param {function} request.yar.flash - flash.
 * @param {function} reply
 * @param {object} data
 * @returns {Function}
 */

"use strict";

const Async = require("async");
const Inflection = require("inflection");

module.exports = (request, reply, data) => {

    const model = data["model"];
    if (!model) {
        request.yar.flash("error", `In path: ${request.path} "MODEL" must be passed with DELETE - blueprint settings.`);
        return reply.redirect("/");
    }

    const query = data["query"];
    if (!query) {
        request.yar.flash("error", `In path: ${request.path} "QUERY" must be passed with DELETE - blueprint settings.`);
        return reply.redirect("/");
    }

    Async.auto({

        "findRecord": (autoCallback) => {

            return query.exec(autoCallback);
        },
        "removeRecord": ["findRecord", (autoCallback, result) => {

            const record = result.findRecord;
            if (!record) {
                return autoCallback(`${model.modelName} not found!`);
            }

            return record.remove(autoCallback);
        }],
        "updateVersion": ["removeRecord", (autoCallback) => { // increment version

            const version = data["version"];
            if (!version) {
                return autoCallback();
            }

            return version(request, Inflection.underscore(model.modelName) + "_version", `DELETE | ${request.path}`, autoCallback);
        }]
    }, (error, result) => {

        if (error || !result.removeRecord) {
            console.log(error);
            request.yar.flash("error", error || "Record could not deleted.");
            return reply.redirect(request.info.referrer);
        }

        request.yar.flash("success", "Successfully deleted!");
        return reply.redirect(request.pre["baseurl"]);
    });
};