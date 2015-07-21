import Ember from 'ember';

export default Ember.Controller.extend({
  xTickFormatter: d3.format(),
  xTooltipFormatter: d3.format(),

  chartData: Ember.A([
    Ember.Object.create({
      title: 'Series 0',
      values: [
        {x: 5, y: 10},
        {x: 10, y: 20},
        {x: 15, y: 15},
        {x: 20, y: 25}
      ]
    }),
    Ember.Object.create({
      title: 'Series 1',
      type: 'scatterPlot',
      values: [
        {x: 5, y: 25},
        {x: 10, y: 30},
        {x: 15, y: 8},
        {x: 20, y: 22}
      ]
    }),
    Ember.Object.create({
      title: 'Series 2',
      type: 'lineGraph',
      values: [
        {x: 5, y: 15},
        {x: 10, y: 10},
        {x: 15, y: 28},
        {x: 20, y: 12}
      ]
    }),
    Ember.Object.create({
      title: 'Series 3',
      type: 'scatterPlot',
      values: [
        {x: 5, y: 28},
        {x: 10, y: 22},
        {x: 15, y: 30},
        {x: 20, y: 5}
      ]
    })
  ])
});
