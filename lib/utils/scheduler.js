/**
 * A scheduler that can decide when to execute a certain
 * timestamped callback so that it happens in sync with a video
 * element.
 *
 * To use it:
 *
 * (1) Initialize a new Scheduler with a clock (to synchronize
 * against) and a callback (to be called when a message is in
 * sync with the video). The clock can be a HTMLVideoElement,
 * or anything that has a `currentTime` property which gives
 * the current presentation time in seconds, and a `pause` and
 * `play` method to control playback.
 *
 * (2) Call the `run` method every time a new message arrives
 * that you want to schedule (it needs to have an ntpTimestamp).
 * As soon at the presentation time is known, call the `init`
 * method and pass in that time, so that the scheduler can
 * start to schedule the callbacks. From then on, whenever
 * a message in the queue has a timestamp that matches the
 * current presentation time of the video, your callback will
 * fire.
 *
 * @class Scheduler
 */

class Scheduler {
  /**
   * Creates an instance of Scheduler.
   * @param {any} clock The clock to use (so we can control playback)
   * @param {any} handler The callback to invoke when a message is in sync
   * @param {number} [tolerance=10] The millisecond tolerance defining "in sync"
   * @memberof Scheduler
   */
  constructor (clock, handler, tolerance = 10) {
    this._clock = clock
    this._handler = handler
    this._tolerance = tolerance

    this.reset()
  }

  /**
   * Bring the scheduler back to it's initial state.
   * @memberof Scheduler
   */
  reset () {
    clearTimeout(this._nextRun)
    clearTimeout(this._nextPlay)
    this._fifo = []
    this._ntpPresentationTime = undefined
    this._suspended = false
  }

  /**
   * Initialize the scheduler.
   *
   * @param {any} ntpPresentationTime The offset representing the start of the presentation
   * @memberof Scheduler
   */
  init (ntpPresentationTime) {
    this._ntpPresentationTime = ntpPresentationTime
    this.run()
  }

  /**
   * Suspend the scheduler.
   *
   * This releases control of the clock and stops any scheduling activity.
   * Note that this doesn't mean the clock will be in a particular state
   * (could be started or stopped), just that the scheduler will no longer
   * control it.
   *
   * @memberof Scheduler
   */
  suspend () {
    clearTimeout(this._nextPlay)
    this._suspended = true
  }

  /**
   * Resume the scheduler.
   *
   * This gives back control of the clock and the ability
   * to schedule messages. The scheduler will immediately
   * try to do that on resume.
   *
   * @memberof Scheduler
   */
  resume () {
    this._suspended = false
    this.run()
  }

  /**
   * Run the scheduler.
   *
   * @param {any} [msg] New message to schedule.
   * @memberof Scheduler
   */
  run (msg) {
    clearTimeout(this._nextRun)
    // If there is a new message, add it to the FIFO queue
    if (typeof msg !== 'undefined') {
      this._fifo.push(msg)
    }
    // If the scheduler is suspended, we can only keep the
    // messages and not do anything with them.
    if (this._suspended) {
      return
    }
    // If there is no way to schedule anything, just return.
    // The first schedule will happen anyway when the
    // presentation time offset is initialized
    if (typeof this._ntpPresentationTime === 'undefined') {
      return
    }
    // If there are no messages, we don't need to bother or
    // even re-schedule, because the new call to .run() will
    // have to come from outside with a new msg.
    if (this._fifo.length === 0) {
      return
    }
    // There is at least one message in the FIFO queue, either
    // display it, or re-schedule the method for later execution
    let timeToPresent
    do {
      msg = this._fifo.shift()
      const ntpTimestamp = msg.ntpTimestamp
      if (typeof ntpTimestamp === 'undefined') {
        continue
      }
      const presentationTime = ntpTimestamp - this._ntpPresentationTime
      timeToPresent = presentationTime - this._clock.currentTime * 1000
      // If the message is within a tolerance of the presentation time
      // then call the handler.
      if (timeToPresent > -this._tolerance && timeToPresent < this._tolerance) {
        this._handler && this._handler(msg)
      }
    } while (timeToPresent < this._tolerance && this._fifo.length > 0)

    if (timeToPresent < -this._tolerance) {
      // we ran out of messages, delay the video with the same amount
      // of delay as the last message had on the FIFO queue.
      // Scheduler will re-run on the next message from outside, so
      // we don't need to re-schedule a new run here.
      this._clock.pause()
      this._nextPlay = setTimeout(() => this._clock.play(), -timeToPresent)
    } else if (timeToPresent > this._tolerance) {
      // message is later than video, add it back to the queue and
      // re-run the scheduling at a later point in time
      this._fifo.unshift(msg)
      this._nextRun = setTimeout(() => this.run(), timeToPresent)
    }
  }
}

module.exports = Scheduler
