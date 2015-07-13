import Ember from 'ember';
import LineChart from 'dummy/controllers/line-chart';

export default LineChart.extend({
  numCharts: 10,
  yTickFormat: '.3s',
  chartData: [],

  charts: Ember.computed('numCharts', 'chartData.[]', function() {
    var result = [];
        // chartData = this.get('chartData');

    for (var i = 0; i < this.get('numCharts'); i++) {
      result.push(Ember.Object.create({
        data: this.createRandomSeries(),
        showContext: true,
        showTooltip: true
      }));
    }

    return Ember.A(result);
  }),


  actions: {
    handleClick: function(clickedPoint) {
      if (Ember.isNone(clickedPoint)) {
        console.log('Got an empty point');
        return;
      }
      console.log('Got a point:', clickedPoint.point.x, clickedPoint.point.y);
    }
  }
});
