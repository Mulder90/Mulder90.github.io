/**
 * Copyright 2014 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * IMA SDK integration plugin for Video.js. For more information see
 * https://www.github.com/googleads/videojs-ima
 */

(function (factory) {
  if (typeof define === 'function' && define['amd']) {
    define(['video.js', 'videojs-contrib-ads'], function (videojs) { factory(window, document, videojs) });
  } else if (typeof exports === 'object' && typeof module === 'object') {
    var vjs = require('video.js');
    require('videojs-contrib-ads');
    factory(window, document, vjs);
  } else {
    factory(window, document, videojs);
  }
})(function (window, document, videojs) {
  "use strict";

  var extend = function (obj) {
    var arg;
    var index;
    var key;
    for (index = 1; index < arguments.length; index++) {
      arg = arguments[index];
      for (key in arg) {
        if (arg.hasOwnProperty(key)) {
          obj[key] = arg[key];
        }
      }
    }
    return obj;
  };

  var ima_defaults = {
    debug: false,
    timeout: 5000,
    prerollTimeout: 100
  };

  var init = function (options, readyCallback) {
    this.ima = new ImaPlugin(this, options, readyCallback);
  };

  var ImaPlugin = function (player, options, readyCallback) {
    this.player = player;

    /**
     * Creates the ad container passed to the IMA SDK.
     * @private
     */
    var createAdContainer_ = function () {
      // The adContainerDiv is the DOM of the element that will house
      // the ads and ad controls.
      this.vjsControls = this.player.getChild('controlBar');
      this.adContainerDiv =
        this.vjsControls.el().parentNode.appendChild(
          document.createElement('div'));
      this.adContainerDiv.id = 'ima-ad-container';
      this.adContainerDiv.style.width = '100%';
      this.adContainerDiv.style.height = '100%';
      this.adDisplayContainer =
        new google.ima.AdDisplayContainer(this.adContainerDiv, this.contentPlayer);
    }.bind(this);

    /**
     * Initializes the AdDisplayContainer. On mobile, this must be done as a
     * result of user action.
     */
    this.initializeAdDisplayContainer = function () {
      this.adDisplayContainerInitialized = true;
      this.adDisplayContainer.initialize();
    }.bind(this);

    /**
     * Creates the AdsRequest and request ads through the AdsLoader.
     */
    this.requestAds = function () {
      if (!this.adDisplayContainerInitialized) {
        this.adDisplayContainer.initialize();
      }
      var adsRequest = new google.ima.AdsRequest();
      if (this.settings.adTagUrl) {
        adsRequest.adTagUrl = this.settings.adTagUrl;
      } else {
        adsRequest.adsResponse = this.settings.adsResponse;
      }

      adsRequest.linearAdSlotWidth = this.getPlayerWidth();
      adsRequest.linearAdSlotHeight = this.getPlayerHeight();

      this.adsLoader.requestAds(adsRequest);
    }.bind(this);

    /**
     * Listener for the ADS_MANAGER_LOADED event. Creates the AdsManager,
     * sets up event listeners, and triggers the 'adsready' event for
     * videojs-ads-contrib.
     * @private
     */
    var onAdsManagerLoaded_ = function (adsManagerLoadedEvent) {
      var contentPlayheadTracker = {
        currentTime: 0,
        previousTime: 0,
        seeking: false,
        duration: 0
      };

      this.adsManager = adsManagerLoadedEvent.getAdsManager(
        contentPlayheadTracker, this.adsRenderingSettings);

      this.adsManager.addEventListener(
        google.ima.AdErrorEvent.Type.AD_ERROR,
        onAdError_);
      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
        this.onContentPauseRequested_);
      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
        this.onContentResumeRequested_);
      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
        onAllAdsCompleted_);

      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.LOADED,
        onAdLoaded_);
      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.STARTED,
        onAdStarted_);
      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.COMPLETE,
        this.onAdComplete_);
      this.adsManager.addEventListener(
        google.ima.AdEvent.Type.SKIPPED,
        this.onAdComplete_);

      try {
        var initWidth = this.getPlayerWidth();
        var initHeight = this.getPlayerHeight();
        this.adsManagerDimensions.width = initWidth;
        this.adsManagerDimensions.height = initHeight;
        this.adsManager.init(
          initWidth,
          initHeight,
          google.ima.ViewMode.NORMAL);
        this.adsManager.setVolume(this.player.muted() ? 0 : this.player.volume());
      } catch (adError) {
        onAdError_(adError);
      }

      this.player.trigger('adsready');
    }.bind(this);

    /**
     * Start ad playback, or content video playback in the absence of a
     * pre-roll. **NOTE**: This method only needs to be called if you provide
     * your own readyCallback as the second parameter to player.ima(). If you
     * only provide options and do not provide your own readyCallback,
     * **DO NOT** call this method. If you do provide your own readyCallback,
     * you should call this method in the last line of that callback. For more
     * info, see this method's usage in our advanced and playlist examples.
     */
    this.startFromReadyCallback = function () {
      try {
        this.adsManager.init(
          this.getPlayerWidth(),
          this.getPlayerHeight(),
          google.ima.ViewMode.NORMAL);
        this.adsManager.setVolume(this.player.muted() ? 0 : this.player.volume());
        this.adsManager.start();
      } catch (adError) {
        onAdError_(adError);
      }
    }.bind(this);

    /**
     * Listener for errors fired by the AdsLoader.
     * @param {google.ima.AdErrorEvent} event The error event thrown by the
     *     AdsLoader. See
     *     https://developers.google.com/interactive-media-ads/docs/sdks/html5/v3/apis#ima.AdError.Type
     * @private
     */
    var onAdsLoaderError_ = function (event) {
      window.console.log('AdsLoader error: ' + event.getError());
      this.adContainerDiv.style.display = 'none';
      if (this.adsManager) {
        this.adsManager.destroy();
      }
      this.player.trigger({ type: 'adserror', data: { AdError: event.getError(), AdErrorEvent: event } });
    }.bind(this);

    /**
     * Listener for errors thrown by the AdsManager.
     * @param {google.ima.AdErrorEvent} adErrorEvent The error event thrown by
     *     the AdsManager.
     * @private
     */
    var onAdError_ = function (adErrorEvent) {
      var errorMessage = adErrorEvent.getError !== undefined ? adErrorEvent.getError() : adErrorEvent.stack;
      window.console.log('Ad error: ' + errorMessage);
      this.vjsControls.show();
      this.adsManager.destroy();
      this.adContainerDiv.style.display = 'none';
      this.player.trigger({ type: 'adserror', data: { AdError: errorMessage, AdErrorEvent: adErrorEvent } });
    }.bind(this);

    /**
     * Pauses the content video and displays the ad container so ads can play.
     * @param {google.ima.AdEvent} adEvent The AdEvent thrown by the AdsManager.
     * @private
     */
    this.onContentPauseRequested_ = function (adEvent) {
      this.adsActive = true;
      this.adPlaying = true;
      // this.player.off('ended', this.localContentEndedListener);
      if (adEvent.getAd().getAdPodInfo().getPodIndex() != -1) {
        // Skip this call for post-roll ads
        this.player.ads.startLinearAdMode();
      }
      this.adContainerDiv.style.display = 'block';

      this.vjsControls.hide();
      this.player.pause();
    }.bind(this);

    /**
     * Resumes content video and hides the ad container.
     * @param {google.ima.AdEvent} adEvent The AdEvent thrown by the AdsManager.
     * @private
     */
    this.onContentResumeRequested_ = function (adEvent) {
      this.adsActive = false;
      this.adPlaying = false;
      // this.player.on('ended', this.localContentEndedListener);
      if (this.currentAd == null || // hide for post-roll only playlist
        this.currentAd.isLinear()) { // don't hide for non-linear ads
        this.adContainerDiv.style.display = 'none';
      }
      this.vjsControls.show();
      if (!this.currentAd) {
        // Something went wrong playing the ad
        this.player.ads.endLinearAdMode();
      } else if (!this.contentComplete &&
        // Don't exit linear mode after post-roll or content will auto-replay
        this.currentAd.getAdPodInfo().getPodIndex() != -1) {
        this.player.ads.endLinearAdMode();
      }
    }.bind(this);

    /**
     * Records that ads have completed and calls contentAndAdsEndedListeners
     * if content is also complete.
     * @param {google.ima.AdEvent} adEvent The AdEvent thrown by the AdsManager.
     * @private
     */
    var onAllAdsCompleted_ = function (adEvent) {
      this.allAdsCompleted = true;
      this.adContainerDiv.style.display = 'none';
    }.bind(this);

    /**
     * Starts the content video when a non-linear ad is loaded.
     * @param {google.ima.AdEvent} adEvent The AdEvent thrown by the AdsManager.
     * @private
     */
    var onAdLoaded_ = function (adEvent) {
      this.player.play();
    }.bind(this);

    /**
     * Starts the interval timer to check the current ad time when an ad starts
     * playing.
     * @param {google.ima.AdEvent} adEvent The AdEvent thrown by the AdsManager.
     * @private
     */
    var onAdStarted_ = function (adEvent) {
      this.adContainerDiv.style.display = 'block';
    }.bind(this);

    /**
     * Clears the interval timer for current ad time when an ad completes.
     * @param {google.ima.AdEvent} adEvent The AdEvent thrown by the AdsManager.
     * @private
     */
    this.onAdComplete_ = function (adEvent) {
    };

    this.getPlayerWidth = function () {
      var computedStyle = getComputedStyle(this.player.el()) || {};

      return parseInt(computedStyle.width, 10) || this.player.width();
    }.bind(this);

    this.getPlayerHeight = function () {
      var computedStyle = getComputedStyle(this.player.el()) || {};

      return parseInt(computedStyle.height, 10) || this.player.height();
    }.bind(this);


    /**
     * Listens for the video.js player to change its fullscreen status. This
     * keeps the fullscreen-ness of the AdContainer in sync with the player.
     * @private
     */
    var onFullscreenChange_ = function () {
      if (this.player.isFullscreen()) {
        if (this.adsManager) {
          this.adsManager.resize(
            window.screen.width,
            window.screen.height,
            google.ima.ViewMode.FULLSCREEN);
        }
      } else {
        if (this.adsManager) {
          this.adsManager.resize(
            this.getPlayerWidth(),
            this.getPlayerHeight(),
            google.ima.ViewMode.NORMAL);
        }
      }
    }.bind(this);

    /**
     * Listens for the video.js player to change its volume. This keeps the ad
     * volume in sync with the content volume if the volume of the player is
     * changed while content is playing
     * @private
     */
    var onVolumeChange_ = function () {
      var newVolume = this.player.muted() ? 0 : this.player.volume();
      if (this.adsManager) {
        this.adsManager.setVolume(newVolume);
      }
    }.bind(this);

    /**
     * Seeks content to 00:00:00. This is used as an event handler for the
     * loadedmetadata event, since seeking is not possible until that event has
     * fired.
     * @private
     */
    var seekContentToZero_ = function () {
      this.player.off('loadedmetadata', seekContentToZero_);
      this.player.currentTime(0);
    }.bind(this);

    /**
     * Seeks content to 00:00:00 and starts playback. This is used as an event
     * handler for the loadedmetadata event, since seeking is not possible until
     * that event has fired.
     * @private
     */
    var playContentFromZero_ = function () {
      this.player.off('loadedmetadata', playContentFromZero_);
      this.player.currentTime(0);
      this.player.play();
    }.bind(this);

    /**
     * Destroys the AdsManager, sets it to null, and calls contentComplete to
     * reset correlators. Once this is done it requests ads again to keep the
     * inventory available.
     * @private
     */
    var resetIMA_ = function () {
      this.adsActive = false;
      this.adPlaying = false;
      // this.player.on('ended', this.localContentEndedListener);
      this.vjsControls.show();
      this.player.ads.endLinearAdMode();
      // Reset the content time we give the SDK. Fixes an issue where requesting
      // VMAP followed by VMAP would play the second mid-rolls as pre-rolls if
      // the first playthrough of the video passed the second response's
      // mid-roll time.
      // this.contentPlayheadTracker.currentTime = 0;
      if (this.adsManager) {
        this.adsManager.destroy();
        this.adsManager = null;
      }
      if (this.adsLoader && !this.contentComplete) {
        this.adsLoader.contentComplete();
      }
      this.contentComplete = false;
      this.allAdsCompleted = false;
    }.bind(this);

    /**
     * Ads an EventListener to the AdsManager. For a list of available events,
     * see
     * https://developers.google.com/interactive-media-ads/docs/sdks/html5/v3/apis#ima.AdEvent.Type
     * @param {google.ima.AdEvent.Type} event The AdEvent.Type for which to listen.
     * @param {function} callback The method to call when the event is fired.
     */
    this.addEventListener = function (event, callback) {
      if (this.adsManager) {
        this.adsManager.addEventListener(event, callback);
      }
    }.bind(this);

    /**
     * Returns the instance of the AdsManager.
     * @return {google.ima.AdsManager} The AdsManager being used by the plugin.
     */
    this.getAdsManager = function () {
      return this.adsManager;
    }.bind(this);

    /**
     * Sets the content of the video player. You should use this method instead
     * of setting the content src directly to ensure the proper ad tag is
     * requested when the video content is loaded.
     * @param {?string} contentSrc The URI for the content to be played. Leave
     *     blank to use the existing content.
     * @param {?string} adTag The ad tag to be requested when the content loads.
     *     Leave blank to use the existing ad tag.
     * @param {?boolean} playOnLoad True to play the content once it has loaded,
     *     false to only load the content but not start playback.
     */
    this.setContentWithAdTag = function (contentSrc, adTag, playOnLoad) {
      resetIMA_();
      this.settings.adTagUrl = adTag ? adTag : this.settings.adTagUrl;
    }.bind(this);

    /**
     * Pauses the ad.
     */
    this.pauseAd = function () {
      if (this.adsActive && this.adPlaying) {
        this.adsManager.pause();
        this.adPlaying = false;
      }
    }.bind(this);

    /**
     * Resumes the ad.
     */
    this.resumeAd = function () {
      if (this.adsActive && !this.adPlaying) {
        this.adsManager.resume();
        this.adPlaying = true;
      }
    }.bind(this);

    /**
     * Current plugin version.
     */
    this.VERSION = '0.6.0';

    /**
     * Stores user-provided settings.
     */
    this.settings;

    /**
     * Video element playing content.
     */
    this.contentPlayer;

    /**
     * Video.js control bar.
     */
    this.vjsControls;

    /**
     * Div used as an ad container.
     */
    this.adContainerDiv;

    /**
     * IMA SDK AdDisplayContainer.
     */
    this.adDisplayContainer;

    /**
     * True if the AdDisplayContainer has been initialized. False otherwise.
     */
    this.adDisplayContainerInitialized = false;

    /**
     * IMA SDK AdsLoader
     */
    this.adsLoader;

    /**
     * IMA SDK AdsManager
     */
    this.adsManager;

    /**
     * IMA SDK AdsRenderingSettings.
     */
    this.adsRenderingSettings = null;

    /**
     * Ad tag URL. Should return VAST, VMAP, or ad rules.
     */
    this.adTagUrl;

    /**
     * VAST, VMAP, or ad rules response. Used in lieu of fetching a response
     * from an ad tag URL.
     */
    this.adsResponse;

    /**
     * Current IMA SDK Ad.
     */
    this.currentAd;

    /**
     * True if ads are currently displayed, false otherwise.
     * True regardless of ad pause state if an ad is currently being displayed.
     */
    this.adsActive = false;

    /**
     * True if ad is currently playing, false if ad is paused or ads are not
     * currently displayed.
     */
    this.adPlaying = false;

    /**
     * True if the ad is muted, false otherwise.
     */
    this.adMuted = false;

    /**
     * True if our content video has completed, false otherwise.
     */
    this.contentComplete = false;

    /**
     * True if ALL_ADS_COMPLETED has fired, false until then.
     */
    this.allAdsCompleted = false;

    /**
     * Stores the dimensions for the ads manager.
     */
    this.adsManagerDimensions = {
      width: 0,
      height: 0
    };

    this.settings = extend({}, ima_defaults, options || {});

    // Currently this isn't used but I can see it being needed in the future, so
    // to avoid implementation problems with later updates I'm requiring it.
    if (!this.settings['id']) {
      window.console.log('Error: must provide id of video.js div');
      return;
    }

    this.contentPlayer = document.getElementById(this.settings['id'] + '_html5_api');

    var contrib_ads_defaults = {
      debug: this.settings.debug,
      timeout: this.settings.timeout,
      prerollTimeout: this.settings.prerollTimeout
    };

    var ads_plugin_settings =
      extend({}, contrib_ads_defaults, options['contribAdsSettings'] || {});

    player.ads(ads_plugin_settings);

    this.adsRenderingSettings = new google.ima.AdsRenderingSettings();
    this.adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;

    createAdContainer_();
    this.adsLoader = new google.ima.AdsLoader(this.adDisplayContainer);
    this.adsLoader.getSettings().setVpaidMode(google.ima.ImaSdkSettings.VpaidMode.INSECURE);
    this.adsLoader.getSettings().setPlayerType('videojs-ima');
    this.adsLoader.getSettings().setDisableCustomPlaybackForIOS10Plus(true);

    this.adsLoader.addEventListener(
      google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      onAdsManagerLoaded_,
      false);
    this.adsLoader.addEventListener(
      google.ima.AdErrorEvent.Type.AD_ERROR,
      onAdsLoaderError_,
      false);

    if (!readyCallback) {
      readyCallback = this.startFromReadyCallback;
    }
    player.on('readyforpreroll', readyCallback);
  };

  // Cross-compatibility for Video.js 5 and 6.
  var registerPlugin = videojs.registerPlugin || videojs.plugin;
  registerPlugin('ima', init);
});
