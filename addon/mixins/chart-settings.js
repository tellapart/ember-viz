import Ember from 'ember';
import {
  defaultTimeFormatter,
  defaultValueFormatter
} from 'ember-viz/utils/formatters';

export default Ember.Mixin.create({
  data: Ember.A([]),
  pointSearchRadius: 10,

  defaultWidth: 600,
  defaultHeightRatio: 0.5,
  contextWidth: 600,
  contextHeight: 70,
  legendWidth: 600,
  legendHeight: 70,
  mainWidth: 600,

  mainHeight: Ember.computed('mainWidth', 'defaultHeightRatio', function() {
    return this.get('defaultHeightRatio') * this.get('mainWidth');
  }),

  mainMargins: Ember.Object.create({top: 20, right: 20, bottom: 30, left: 50}),
  contextMargins: Ember.Object.create({top: 10, right: 20, bottom: 30, left: 50}),
  legendMargins: Ember.Object.create({top: 10, right: 20, bottom: 30, left: 50}),

  forceX: null,
  forceY: null,
  includeZero: false,

  xGridTicks: 5,
  yGridTicks: 5,

  selectedPoint: null,
  showTooltip: true,
  showTooltipPoint: true,
  showContext: false,
  showLegend: false,

  xTickFormatter: Ember.computed('_data.[]', function() {
    var data = this.get('_data');
    return defaultTimeFormatter(data);
  }),
  xTooltipFormatter: Ember.computed('_data.[]', function() {
    var data = this.get('_data');
    return function(input) {
      return defaultTimeFormatter(data)(new Date(input));
    };
  }),

  yTickFormatter: defaultValueFormatter,
  yTooltipFormatter: Ember.computed.alias('yTickFormatter')
});
