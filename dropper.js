var Discord = require('discord.io');
var logger = require('winston');
var Jimp = require('jimp');

// Configure logger settings
logger.remove(logger.transports.Console);

logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = process.env.DEBUG ? 'debug' : 'error';

var Dropper = (function dropper() {

    // constants
    const triggerWord = "!dropper",
        gridWidth = 250,
        boxWidth = 25,
        xCoords = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        yCoords = ['I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
        gamePresence = triggerWord + " to go";

    // properties
    var myId,
        discordBot,
        places = [];

    /**
     * Init the system
     *
     * @param bot
     */
    dropper.initialize = function (bot) {

        myId = bot.id;
        discordBot = bot;

        discordBot.setPresence({
            game: {name: gamePresence, type: 0}
        });

        makePlaces();

        logger.info('Up and running as: ' + discordBot.username + '(' + myId + ')');
    };

    // Parse places.json into var places
    function makePlaces() {
        var _places = require('./places.json');

        for (var key in _places) {
            var category = _places[key];

            category.forEach(function (place) {
                places.push({
                    category: key,
                    name: place.name,
                    weightMin: place.weightMin,
                    weightMax: place.weightMax,
                    coords: place.coords,
                    skipped: place.skipped,
                    blacklisted: place.blacklisted,
                    skippedUntil: null,
                    lastUsed: null
                })
            });
        }
    }

    /**
     * Create the message
     *
     * @param locale
     * @param coords
     * @returns {string|string}
     */
    function getDropperMessage(locale, coords) {
        return "Drop Zone: " + locale.name
            + "\nCategory: " + locale.category
            + "\nCoords: " + (typeof coords === "object" ? coords.x + "," + coords.y : "none")
    }

    /**
     * Get a random value from an array
     * @param arr
     * @returns {*}
     */
    function getRandomEntry(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Calculate the crop offset
     *
     * @param coordSet
     * @param grid
     * @returns {number}
     */
    function calculateCoordinates(coordSet, grid) {
        return (coordSet.indexOf(grid.substring(0, 1)) * gridWidth) + (grid.substring(1, 2) * boxWidth);
    }

    /**
     * Generate image message
     *
     * @param x
     * @param y
     * @param callback
     */
    function makeImage(x, y, callback) {

        var imgFile = __dirname + "/assets/erangel.png",
            overlay = __dirname + "/assets/overlay.png";

        // read Map file
        Jimp.read(imgFile, function (err, image) {
            if (err) {
                callback(err, null);
            }

            // Read overlay file
            Jimp.read(overlay, function (e, over) {
                if (err) {
                    callback(err, null);
                }

                // Place the overlay on top of the map at the given coords
                image.composite(over, x, y);

                // add 5 tiles in each dir
                var newX = x - (5 * boxWidth),
                    newY = y - (5 * boxWidth);

                // crop the image to 6x6 (center tile is DZ)
                image.crop(newX, newY, (gridWidth + boxWidth), (gridWidth + boxWidth), function (empty, jimp) {
                    if (err) {
                        callback(err, null);
                    }

                    // Pull the buffer and return it
                    jimp.getBuffer(Jimp.AUTO, function (error, buffer) {
                        return callback(error, buffer);
                    });
                });

            });

        });
    }

    /**
     *
     * @param min
     * @param max
     * @returns {number}
     */
    function getRandomNumber(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    /**
     * Determine if the locale meets all the rules
     *
     * @param place
     * @param rules
     * @returns {boolean}
     */
    function isSufficientlyRandom(place, rules) {
        var meetsRules = false;

        if (rules.hasOwnProperty('weight')) {
            meetsRules = place.weightMin <= rules.weight && place.weightMax >= rules.weight;
        }

        return meetsRules;
    }

    /**
     * Handle errors
     *
     * @param error
     * @returns {boolean}
     */
    function handleError(error) {
        if (null === error) {
            return false;
        }
        console.log(error);
    }

    /**
     * Returns an array of places meeting the randomness criteria
     *
     * @param placeListing
     * @param weight
     * @param callback
     * @param it
     * @returns {*}
     */
    function findLocationsByWeight(placeListing, weight, callback, it) {
        var iterations = it || 0;

        if (iterations >= 30) {
            return callback.call(new Error("Too many iterations"), null);
        }

        // iterate all the places and build a map based on weight
        var canGoTo = [];

        // rules
        var rules = {
            weight: weight
        };

        placeListing.forEach(function (place) {
            if (isSufficientlyRandom(place, rules)) {
                canGoTo.push(place);
            }
        });

        // if we have nowhere to go, then don't go there
        if (canGoTo.length < 1) {
            return dropper.findLocationsByWeight(placeListing, weight, callback, iterations + 1);
        }

        return callback(null, canGoTo);
    };

    /**
     * Render the message to Discord
     * @param message
     */
    function output(message) {
        if (message.hasOwnProperty('file') && message.file instanceof Buffer) {
            bot.uploadFile(message, handleError);
        }
        else {
            bot.sendMessage(message, handleError);
        }
    }

    /**
     * Create the message for upstream
     *
     * @param locale
     * @param callback
     * @returns {*}
     */
    function generateMessage(locale, callback) {
        logger.info(locale);

        // does the locale have coords?
        if (!locale.coords.length) {
            logger.info("No coords for: " + locale.name);
            return callback({message: getDropperMessage(locale, null)});
        }

        // pick the coords
        var coords = getRandomEntry(locale.coords);

        // create our image and message
        makeImage(calculateCoordinates(xCoords, coords.x), calculateCoordinates(yCoords, coords.y), function (error, buffer) {
            return callback({
                file: buffer,
                filename: locale.name + '.png',
                message: getDropperMessage(locale, coords)
            })
        });
    }

    /**
     * Read the incoming message and parse for commands
     *
     * @param user
     * @param userId
     * @param channelID
     * @param msg
     * @param event
     * @returns {boolean}
     */
    dropper.handleMessage = function (user, userId, channelID, msg, event) {
        if (userId === myId) {
            return false;
        }

        var message = msg.toString().toLocaleLowerCase();

        // Register the NS "!dropper"
        if (message.substring(0, triggerWord.length) === triggerWord) {
            // log the message
            logger.info({user: user, userId: userId, channel: channelID, says: message});

            // locate a stack of places possible to go to w/ a random number
            findLocationsByWeight(places, getRandomNumber(1, 100), function (err, availableList) {
                // pluck a random entry
                generateMessage(getRandomEntry(availableList), function (object) {
                    object.to = channelID;
                    output(object);
                });
            });
        }
    };

    return dropper;
}());

// Initialize Discord Bot
var bot = new Discord.Client({
    token: process.env.AUTH,
    autorun: true
});

// As soon as we're connected
bot.on('ready', function (evt) {
    logger.info('Client initialized - booting.');
    Dropper.initialize(bot);
});

// Parse messages
bot.on('message', Dropper.handleMessage);


