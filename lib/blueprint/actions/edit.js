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

module.exports = (request, reply, data) => {

    const query = data["query"];
    if (!query) {
        request.yar.flash("error", `In path: ${request.path} "QUERY" must be passed with EDIT - blueprint settings.`);
        return reply.redirect("/");
    }

    const viewPath = data["view"];
    if (!viewPath) {
        request.yar.flash("error", `In path: ${request.path} "VIEW" must be passed with EDIT - blueprint settings.`);
        return reply.redirect("/");
    }

    const relations = data["relations"];
    const relationValues = {};

    Async.auto({

        "getRecord": (autoCallback) => {
            query.exec(autoCallback);
        },
        "getRelations": (autoCallback) => {

            if (!relations) {
                return autoCallback();
            }

            Async.forEachOf(relations, (relation, relationKey, forEachCallback) => {

                relation.exec((error, instances) => {

                    if (error) {
                        return forEachCallback(error);
                    }

                    relationValues[relationKey] = instances;
                    return forEachCallback();
                });
            }, autoCallback);
        }
    }, (error, result) => {

        if (error || !result.getRecord) {
            request.yar.flash("error", error || "Record not found.");
            return reply.redirect(request.pre["baseurl"]);
        }

        return reply.view(viewPath, {
            record: result.getRecord,
            relations: relationValues
        });

    });
};