import BaseComponent from 'ember-viz/components/base-component';
import ChartSettings from 'ember-viz/mixins/chart-settings';
import Ember from 'ember';
// import {getDomain, overrideDomain, sanitizeDataArray} from 'ember-viz/utils/misc';

export default BaseComponent.extend(ChartSettings, {
  classNames: ['ev-line-chart'],
  _isTooltipInYield: true,

  _showDefaultTooltip: Ember.computed('showTooltip', '_isTooltipInYield',
    function() {
    return this.get('showTooltip') && !this.get('_isTooltipInYield');
  }),

  initializer: Ember.on('init', function() {
    window.linechart = this;
  }),

  height: Ember.computed('width', 'defaultHeightRatio', function() {
    if (this._state === 'inBuffer') {
      return 0;
    }
    var heightRatio = this.get('defaultHeightRatio'),
        width = this.get('width');

    // The browser didn't determine a height for the div, so fall back to
    // a height determined by a ratio of the width.

    return heightRatio * width;
  }),

  mainHeight: Ember.computed('height', 'showLegend', 'showContext', function() {
    var height = this.get('height');

    // if (this.get('showLegend')) {
    //   height -= this.get('legendHeight')
    // }
    if (this.get('showContext')) {
      height -= this.get('contextHeight');
    }
    return Math.max(height, 0);
  }),


  width: Ember.computed('defaultWidth', function() {
    if (this._state === 'inBuffer') {
      return 0;
    }
    var width = this.$().width();

    if (width === 0) {
      // The browser didn't determine a width for the div, so fall back to
      // a default width.
      return this.get('defaultWidth');
    }
    return Math.max(width, 0);
  }),

  mainWidth: Ember.computed.alias('width'),
  contextWidth: Ember.computed.alias('width'),

  didInsertElement: function() {
    var self = this;

    // Function to determine whether a tooltip was already included in the
    // yield section of the template. If not, the default tooltip will be
    // rendered.
    function isTooltipInChildren(view) {
      var child, classNames;
      if (Ember.isNone(view._childViews)) {
        return false;
      }
      for (var i = 0; i < view._childViews.length; i++) {
        child = view._childViews[i];
        classNames = Ember.get(child, 'element.className');

        if (!Ember.isNone(classNames) && typeof classNames === 'string' &&
            classNames.indexOf('ev-chart-tooltip') !== -1) {
          return true;
        }

        if (isTooltipInChildren(child)) {
          return true;
        }
      }
      return false;
    }

    function resize(elem) {
      elem.notifyPropertyChange('height');
      elem.notifyPropertyChange('width');
    }

    this.set('_isTooltipInYield', isTooltipInChildren(this));

    resize(this);

    // Re-render the chart when the window is resized.
    $(window).resize(function() {
      resize(self);
    });
  },
  willDestroyElement: function() {
    console.log('Got to willDestroyElement');
  },
  actions: {
    onClick: function(clickedPoint) {
      console.log('Got to onClick action in line-chart');
      this.sendAction('onClick', clickedPoint);
    }
  }

});
