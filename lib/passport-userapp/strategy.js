/**
 * Module dependencies.
 */
var passport = require('passport'),
    UserApp = require('userapp'),
    util = require('util');

/**
 * `Strategy` constructor.
 *
 * The local authentication strategy authenticates requests based on the
 * credentials submitted through an HTML-based login form, or using a
 * session token sent as a cookie.
 *
 * Applications must supply a `verify` callback which accepts `username` and
 * `password` credentials, and then calls the `done` callback supplying a
 * `user`, which should be set to `false` if the credentials are not valid.
 * If an exception occured, `err` should be set.
 *
 * Optionally, `options` can be used to change the fields in which the
 * credentials are found.
 *
 * Options:
 *   - `usernameField`  field name where the username is found, defaults to _username_
 *   - `passwordField`  field name where the password is found, defaults to _password_
 *   - `sessionCookie`  cookie name where the session token is found, defaults to _ua_session_token_
 *   - `appId`          the UserApp App Id to connect to
 *
 * Examples:
 *
 *     passport.use(new LocalStrategy(
 *       function(username, password, done) {
 *         User.findOne({ username: username, password: password }, function (err, user) {
 *           done(err, user);
 *         });
 *       }
 *     ));
 *
 * @param {Object} options
 * @param {Function} verify
 * @api public
 */
function Strategy(options, verify) {
    if (typeof options == 'function') {
        verify = options;
        options = {};
    }

    if (!verify) throw new Error('userapp authentication strategy requires a verify function');
    if (!options.appId) throw new Error('userapp strategy requires an app id');

    this._appId = options.appId;
    this._usernameField = options.usernameField || 'username';
    this._passwordField = options.passwordField || 'password';
    this._sessionCookie = options.sessionCookie || 'ua_session_token';

    passport.Strategy.call(this);
    this.name = 'userapp';
    this._verify = verify;

    // Initialize UserApp
    UserApp.initialize({ appId: this._appId });
}

/**
 * Inherit from `passport.Strategy`.
 */
util.inherits(Strategy, passport.Strategy);

/**
 * Authenticate request based on the contents of a form submission
 * or session cookie.
 *
 * @param {Object} req
 * @api protected
 */
Strategy.prototype.authenticate = function (req, options, next) {
    var self = this;

    options = options || {};
    var username = lookup(req.body, this._usernameField) || lookup(req.query, this._usernameField);
    var password = lookup(req.body, this._passwordField) || lookup(req.query, this._passwordField);
    var sessionToken = req.cookies ? req.cookies[this._sessionCookie] : null;

    if ((!username || !password) && !sessionToken) {
        return this.fail('Missing credentials or session cookie');
    }

    function verified(err, user, info) {
        if (err) {
            return self.error(err);
        }
        if (!user) {
            return self.fail(info);
        }
        self.success(user, info);
    }

    function parseProfile(userappUser) {
        return {
            provider: 'userapp',
            id: userappUser.user_id,
            username: userappUser.login,
            name: {
                familyName: userappUser.last_name,
                givenName: userappUser.first_name
            },
            email: userappUser.email,
            emails: [
                { value: userappUser.email }
            ],
            permissions: userappUser.permissions,
            features: userappUser.features,
            properties: userappUser.properties,
            subscription: userappUser.subscription,
            lastLoginAt: userappUser.last_login_at,
            updatedAt: userappUser.updated_at,
            createdAt: userappUser.created_at,
            _raw: userappUser
        };
    }

    function lookup(obj, field) {
        if (!obj) {
            return null;
        }
        var chain = field.split(']').join('').split('[');
        for (var i = 0, len = chain.length; i < len; i++) {
            var prop = obj[chain[i]];
            if (typeof(prop) === 'undefined') {
                return null;
            }
            if (typeof(prop) !== 'object') {
                return prop;
            }
            obj = prop;
        }
        return null;
    }

    function getUser() {
        UserApp.User.get({ user_id: 'self' }, function(error, users) {
            if (!error && users && users.length > 0) {
                self._verify(parseProfile(users[0]), verified);
            } else {
                self.error(new Error('Error when getting user profile: "' + error.message + '"'));
            }
        });
    }

    if (sessionToken && req.isAuthenticated()) {
        self._verify(req.user, verified);
        return;
    }

    if (sessionToken) {
        UserApp.setToken(sessionToken);
        getUser();
    } else {
        UserApp.User.login({ login: username, password: password }, function(error) {
            if (error) {
                self._verify(false, verified);
            } else {
                getUser();
            }
        });
    }
};

/**
 * Expose `Strategy`.
 */
module.exports = Strategy;