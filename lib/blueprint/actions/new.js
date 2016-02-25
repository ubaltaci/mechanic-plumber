/**
 *
 * @param {object} request
 * @param {object} request.yar - yar.
 * @param {function} request.yar.flash - flash.
 * @param {function} reply
 * @param {object} fields
 * @returns {Function}
 */

"use strict";

const Async = require("async");

module.exports = (request, reply, fields) => {

    const viewPath = fields["view"];
    if (!viewPath) {
        request.yar.flash("error", `In path: ${request.path} "VIEW" must be passed with NEW - blueprint settings.`);
        return reply.redirect("/");
    }

    const relations = fields["relations"];
    if (!relations) {
        return reply.view(viewPath);
    }

    const relationValues = {};

    Async.forEachOf(relations, (relation, relationKey, forEachCallback) => {

        relation.exec((error, instances) => {

            if (error) {
                return forEachCallback(error);
            }

            relationValues[relationKey] = instances;
            return forEachCallback();
        });
    }, (error) => {

        if (error) {
            request.yar.flash("error", error);
            return reply.redirect(request.pre["baseurl"]);
        }
        
        return reply.view(viewPath, {
            relations: relationValues
        });
    });
};