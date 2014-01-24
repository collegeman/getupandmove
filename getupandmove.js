// TODO: if loading from scratch and at least 20 minutes past nextBreakAt, reset the clock

!function($) {

  'use strict';

  /**
   * Standard global stuff
   */
  var $W = $(window), $B = $('body'),
  /**
   * Minimum break time is 2 minutes, so says the Ministry of Health
   */
  MIN_BREAK_LENGTH = 120000, // 2 mins in millis
  /**
   * Maximum working session time is 20 minutes, so says the Ministry of Health
   */
  MAX_WORK_LENGTH = 20, // 20 mins
  /**
   * Our break alarm--a soft beeping sound
   */
  tone = $('#tone'),
  /**
   * When is the next break?
   */
  nextBreakAt = null,
  /**
   * When did the last break start?
   */
  breakBeganAt = null,
  /**
   * The human-readable label for when the next break is
   */
  $untilBreakHuman = $('.until-break-human'),
  /**
   * The clock tracking time until break
   */
  $untilBreakClock = $('#until-break-clock'),
  /**
   * The clock tracking the time you've been on a break
   */
  $breakLengthClock = $('#break-length-clock'),
  /**
   * The resume work button
   */
  $btnResumeWork = $('#btn-resume-work'),
  /**
   * Is the user on a break?
   */
  onBreak = false,
  /**
   * Normalize requestAnimationFrame
   */
  requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||  window.webkitRequestAnimationFrame || window.msRequestAnimationFrame,
  /**
   * An interval for checking the time
   */
  checkClockInterval = null;

  /**
   * Reset break alarm
   * @param int Optionally, the number of minutes to put on the clock
   * @param bool force accept minutes input, as long as it is valid
   * must be at least MAX_WORK_LENGTH minutes
   */
  function resetBreakAlarm(minutes, force) {
    minutes = parseInt(minutes);
    minutes = !minutes || (minutes < MAX_WORK_LENGTH && !force) ? MAX_WORK_LENGTH : minutes;
    nextBreakAt = moment().add('minutes', minutes);
    $.cookie('nextBreakAt', nextBreakAt);
  }

  /**
   * @return bool If the current break has been sufficient
   */
  function canResumeWork() {
    return !breakBeganAt || !breakBeganAt.isValid() || moment().diff(breakBeganAt) >= MIN_BREAK_LENGTH;
  }

  function shouldTakeBreakNow() {
    return moment().diff(nextBreakAt) > MAX_WORK_LENGTH;
  }

  function onBreakStateChange() {
    $.cookie('onBreak', onBreak ? 1 : '');
    $.cookie('breakBeganAt', breakBeganAt ? breakBeganAt : '');
    $B.toggleClass('on-break', onBreak);
    if (!onBreak && ( !nextBreakAt || !nextBreakAt.isValid() )) {
      resetBreakAlarm();
    }
  }

  /**
   * Change the break state: on (true) or off (false).
   * @return bool true if state change was successful; otherwise, false
   * @see canResumeWork
   */
  function setOnBreak(bool) {
    if (bool) {
      onBreak = true;
      breakBeganAt = moment();
      nextBreakAt = null;
      onBreakStateChange();
      mixpanel.track('Took a Break');
      return true;
    } else if (canResumeWork()) {
      onBreak = false;
      mixpanel.track('Resumed Work', {
        length: breakBeganAt && breakBeganAt.isValid() ? moment().diff(breakBeganAt, 'minutes', true) : -1
      });
      breakBeganAt = null;
      onBreakStateChange();
      return true;
    } else {
      return false;
    }
  }

  function playTone() {
    if (!tone.playing) {
      tone.get(0).play();
      tone.playing = true;
    }
  }

  function stopTone() {
    if (tone.playing) {
      tone.get(0).pause();
      tone.get(0).currentTime = 0;
      tone.playing = false;
    }
  }

  // external API
  window.GetUpAndMove = {

    reset: function(minutes) {
      resetBreakAlarm(minutes, true);
    },
    
    snooze: function() {

    },

    breakNow: function() {
      setOnBreak(true);
    },

    resume: function() {
      setOnBreak(false);
    }

  }

  function init() {
    
    // Store the value of breakBeganAt in a cookie
    // so that if the page refreshes, we stay on schedule.
    onBreak = $.cookie('onBreak') ? true : false;
    if (onBreak && $.cookie('breakBeganAt')) {
      breakBeganAt = moment($.cookie('breakBeganAt'));
      // long enough break? back to work!
      if (canResumeWork()) {
        setOnBreak(false);
      }

    } else if ($.cookie('nextBreakAt')) {
      nextBreakAt = moment($.cookie('nextBreakAt'));
    }
    
    onBreakStateChange();

    // kick-off animation
    requestAnimationFrame(redraw); 

    checkClockInterval = setInterval(function() {
      $B.toggleClass('can-resume-work', onBreak && canResumeWork());

      if (!onBreak && shouldTakeBreakNow()) {
        playTone();
      } else {
        stopTone();
      }
    }, 1000);
  }

  /**
   * Pad the given string with 0
   * @param number
   * @param desired output length
   * @return String
   */
  function padNumLen(num, len) {
    var num = Math.abs(num), neg = num != num, str = new String(num);
    while(str.length < len) {
      str = '0' + str;
    }
    return neg ? '-' + str : str;
  }

  /**
   * Given a quantity of milliseconds, build a string of format ii:ss.uuu
   * @param int Quantity of milliseconds
   * @param bool Include hours in display
   * @return String
   */
  function getClockFace(time, showHours) {
    var diff = time;
    var hours = Math.floor(diff / ( 1000 * 60 * 60));
    diff -= hours * 1000 * 60 * 60;
    var mins = Math.floor(diff / ( 1000 * 60 ));
    diff -= mins * 1000 * 60;
    var secs = Math.floor(diff / 1000);
    diff -= secs * 1000;
    var millis = diff;
    if (showHours) {
      return padNumLen(hours, 2) + ':' + padNumLen(mins, 2) + ':' + padNumLen(secs, 2);
    } else {
      return padNumLen(mins, 2) + ':' + padNumLen(secs, 2) + '.' + padNumLen(millis, 3);
    }
  }

  /**
   * Redraw the screen.
   */
  function redraw() {
    
    // not on a break?
    if (!onBreak) {
    
      if (shouldTakeBreakNow()) {
        $untilBreakHuman.text('now');
        $untilBreakClock.text('00:00.000');
      } else {
        // update the break clock labels
        $untilBreakHuman.text(nextBreakAt.fromNow());
        $untilBreakClock.text(getClockFace(nextBreakAt.diff()));
      }
    
    // on a break
    } else {

      $btnResumeWork.prop('disabled', !canResumeWork());
      $btnResumeWork.toggleClass('btn-inverse', !canResumeWork());
      $btnResumeWork.toggleClass('btn-primary', canResumeWork());

      if (!canResumeWork()) { 
        var copy = moment(breakBeganAt);
        copy.add('milliseconds', MIN_BREAK_LENGTH);
        $btnResumeWork.text('Resume ' + copy.fromNow());  
      } else {
        $btnResumeWork.text('Resume Work Now');
      }

      $breakLengthClock.text(getClockFace(moment().diff(breakBeganAt), true));

    }

    setTimeout(function() {
      requestAnimationFrame(redraw);
    }, onBreak ? 1000 : 100);

  };

  init();

}(jQuery);