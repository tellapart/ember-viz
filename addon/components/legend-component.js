import BaseComponent from 'ember-viz/components/base-component';
import ChartSettings from 'ember-viz/mixins/chart-settings';
import Ember from 'ember';

export default BaseComponent.extend(ChartSettings, {
  classNames: ['ev-legend'],

  didInsertElement: function() {
    this.updateSizes();
    this.updateContent();
  },

  updateSizes: Ember.observer('legendMargins.{top,bottom,right,left}', 'legendHeight',
                            function() {
    var legendMargins = this.get('legendMargins');
    this.$()
      .css('max-height', this.get('legendHeight'))
      .css('margin-top', legendMargins.top)
      .css('margin-right', legendMargins.right)
      .css('margin-bottom', legendMargins.bottom)
      .css('margin-left', legendMargins.left);

  }),

  updateContent: Ember.observer('data.[]', function() {
    var self = this,
        clickTimeoutId,
        doubleclick,
        legendDiv = this.d3(),
        data = this.get('data'),
        colorFn = this.get('colorFn');

    var legendItems = legendDiv.selectAll('.legend-item')
      .data(data);

    var itemEnter = legendItems.enter()
      .append('div')
      .attr('class', 'legend-item')
      .on('click', function(d, index) {
        var newColor,
            elem = this;
        if (!clickTimeoutId) {
          clickTimeoutId = window.setTimeout(function() {
            if (!doubleclick) {
              d.toggleProperty('disabled');
              newColor = getFillColor(d, index);
              d3.select(elem).select('circle').attr('fill', newColor);
            }
            clickTimeoutId = 0;
          }, 200);
        }
      })
      .on('dblclick', function(d, index) {
        doubleclick = true;

        data.setEach('disabled', true);
        d.set('disabled', false);

        legendDiv.selectAll('circle')
          .attr('fill', 'white');
        d3.select(this).select('circle').attr('fill', getFillColor(d, index));
        window.setTimeout(function() { doubleclick = false; }, 800);
      });

    function getFillColor(d, index) {
      var normalColor = d.get('color') || colorFn(d, index);
      return (d.get('disabled') ? 'white': normalColor);
    }

    itemEnter
      .append('svg')
        .attr('class', 'ev-svg')
        .attr('height', 12)
        .attr('width', 14)
      .append('circle')
        .attr('fill', getFillColor)
        .attr('stroke', 'black')
        .attr('cx', 6)
        .attr('cy', 6)
        .attr('r', 5);

    itemEnter
      .append('a');

    // Update the item text;
    legendItems.each(function(d) {
      d3.select(this).select('a')
        .text(function(d) { return d.get('title'); });
    });

    legendItems.exit()
      .remove();

  }),
});
