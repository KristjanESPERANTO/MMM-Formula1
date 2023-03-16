/* MMM-Formula1
 * Node Helper
 *
 * By Ian Perrin http://github.com/ianperrin/MMM-Formula1
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Log = require("logger");
const f1Api = require("f1-api");

let ical;
let raceScheduleDB = false;

module.exports = NodeHelper.create({
	// Subclass start method.
	start() {
		Log.log(`Starting module: ${this.name}`);
		this.config = {};
	},

	// Subclass socketNotificationReceived received.
	socketNotificationReceived(notification, payload) {
		Log.log(`${this.name} received a notification: ${notification}`);
		if (notification === "CONFIG") {
			this.config = payload;
			// Clear existing timers
			if (this.standingsTimerId) {
				clearTimeout(this.standingsTimerId);
			}
			if (this.scheduleTimerId) {
				clearTimeout(this.scheduleTimerId);
			}
			// Set up race calendar if required
			if (this.config.calendar) {
				ical = require("ical-generator");
				this.fetchSchedule();
				this.expressApp.get(`/${this.name}/schedule.ics`, this.serverSchedule);
			}
			// Get standings data
			this.fetchStandings();
		}
	},

	/**
	 * fetchStandings
	 * Request driver or constructor standings from the Ergast MRD API and broadcast it to the MagicMirror module if it's received.
	 */
	fetchStandings() {
		Log.log(`${this.name} is fetching ${this.config.type} standings for the ${this.config.season} season`);
		const endpoint = this.config.type === "DRIVER" ? "getDriverStandings" : "getConstructorStandings";
		const season = (this.config.season === "current", new Date().getFullYear(), this.config.season);
		const self = this;
		f1Api[endpoint](season).then((standings) => {
			Log.log(`${this.name} is returning ${this.config.type} standings for the ${season} season`);
			this.sendSocketNotification(`${this.config.type}_STANDINGS`, standings);
			this.standingsTimerId = setTimeout(() => {
				self.fetchStandings();
			}, this.config.reloadInterval);
		});
	},

	/**
	 * fetchSchedule
	 * Request current race schedule from the Ergast MRD API and broadcast as an iCal
	 */
	fetchSchedule() {
		Log.log(`${this.name} is fetching the race schedule for the ${this.config.season} season`);
		const season = (this.config.season === "current", new Date().getFullYear(), this.config.season);
		const self = this;
		f1Api.getSeasonRacesSchedule(season).then((raceSchedule) => {
			if (raceSchedule) {
				raceScheduleDB = raceSchedule;
				this.sendSocketNotification("RACE_SCHEDULE", raceSchedule);
			}
			this.scheduleTimerId = setTimeout(() => {
				self.fetchSchedule();
			}, this.config.reloadInterval);
		});
	},

	/**
	 * serverSchedule
	 * Publish race schedule as an iCal
	 *
	 * @param req
	 * @param res
	 */
	serverSchedule(req, res) {
		Log.log("Serving the race schedule iCal");
		const cal = ical({ domain: "localhost", name: "Formula1 Race Schedule" });
		if (raceScheduleDB) {
			for (let i = 0; i < raceScheduleDB.length; i += 1) {
				// Parse date/time
				const utcDate = raceScheduleDB[i].date;
				const startDate = Date.parse(utcDate);
				if (startDate && !Number.isNaN(startDate)) {
					// Create Event
					cal.createEvent({
						start: new Date(startDate),
						end: new Date(startDate),
						summary: raceScheduleDB[i].name,
						location: raceScheduleDB[i].circuit.name
						// url: raceScheduleDB[i].url
					});
				}
			}
		}
		cal.serve(res);
	}
});
