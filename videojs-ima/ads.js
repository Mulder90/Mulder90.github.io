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
 */

var Ads = function () {

  this.player = videojs('content_video');
  var contentPlayer = document.getElementById('content_video_html5_api');

  this.options = {
    id: 'content_video'
  };

  this.events = [
    google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
    google.ima.AdEvent.Type.CLICK,
    google.ima.AdEvent.Type.COMPLETE,
    google.ima.AdEvent.Type.FIRST_QUARTILE,
    google.ima.AdEvent.Type.LOADED,
    google.ima.AdEvent.Type.MIDPOINT,
    google.ima.AdEvent.Type.PAUSED,
    google.ima.AdEvent.Type.STARTED,
    google.ima.AdEvent.Type.THIRD_QUARTILE
  ];

  this.player.ima(this.options);
}

Ads.prototype.SAMPLE_AD_TAG = 'https://svastx.moatads.com/dentsupgitalysizmekvideo27850520180/SWIFFER_-_Italy_-_ISP_SWIFFER_OTTOBRE_17_268182_2017_10-22605300_js.xml';

Ads.prototype.init = function () {
  this.player.ima.initializeAdDisplayContainer();
  this.player.ima.setContentWithAdTag(null, this.SAMPLE_AD_TAG, true);
  this.player.ima.requestAds();
  this.player.play();
};
