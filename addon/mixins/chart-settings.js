import Ember from 'ember';
import {getAverageGranularity} from 'ember-viz/utils/misc';

var MILLISECONDS_IN_MINUTE = 60000;
var MILLISECONDS_IN_DAY = MILLISECONDS_IN_MINUTE * 60 * 24;

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

  timeFormat: Ember.computed('_data.[]', function() {
    var data = this.get('_data'),
        timeFormatter = this.get('timeFormatter'),
        avgGranularity = getAverageGranularity(data);

    // If the average granularity is around or greater than one point per day,
    // only show month and date.
    if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
      return '%m/%d';
    }

    // If the average granularity is less than a minute, show the month, date,
    // hour, minute, and second.
    if (avgGranularity <= MILLISECONDS_IN_MINUTE) {
      return '%m/%d %H:%M:%S';
    }

    // Otherwise, show month, date, hour, and minute.
    return timeFormatter('%m/%d %H:%M');
  }),
  timeTickFormat: Ember.computed.alias('timeFormat'),
  timeFormatter: d3.time.format.utc,

  valueFormat: '',
  valueFormatter: d3.format,
  valueTickFormat: '',
  valueTickFormatter: d3.format
});
