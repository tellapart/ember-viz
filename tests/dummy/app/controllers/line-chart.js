import Ember from 'ember';

export default Ember.Controller.extend({
  selectedPoint: null,
  isTooltipVisible: true,
  actionsList: Ember.A([]),
  chartData: Ember.A([
    Ember.Object.create({
      title: 'Series 0',
      values: [
        {x: 1421971200000, y: 10},
        {x: 1422057600000, y: 20},
        {x: 1422144000000, y: 15},
        {x: 1422230400000, y: 25}
      ]
    })
  ]),

  createRandomSeries: function() {
    var chartData = [],
        numSeries = 1 + Math.floor(Math.random() * 20),
        numPoints = 20 + Math.floor(Math.random() * 100),
        startTs  = 1421971200000;

    for (var seriesIndex = 0; seriesIndex < numSeries; seriesIndex++) {
      var seriesValues = [];
      for (var pointIndex = 0; pointIndex < numPoints; pointIndex++) {
        seriesValues.push({
          x: startTs + 86400000 * pointIndex,
          y: 500 + Math.random() * 40 + seriesIndex * 100
        });
      }
      chartData.push(Ember.Object.create({
        title: 'Series ' + seriesIndex,
        values: seriesValues
      }));
    }

    return Ember.A(chartData);
  },

  actions: {
    randomizeData: function() {
      console.log('Randomizing data');
      var chartData = this.createRandomSeries();
      this.setProperties({
        chartData: chartData,
        brushExtent: null
      });
    },
    triggerAction: function() {
      console.log('Handled it in the controller');

      this.get('actionsList').pushObject('"triggerAction" action at ' + new Date());
    }

  }

});
