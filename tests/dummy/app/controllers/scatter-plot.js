import Ember from 'ember';

export default Ember.Controller.extend({
  chartData: Ember.A([
    Ember.Object.create({
      title: 'Series 0',
      values: [
        {x: 1421971200000, y: 10},
        {x: 1422057600000, y: 20},
        {x: 1422144000000, y: 15},
        {x: 1422230400000, y: 25}
      ]
    }),
    Ember.Object.create({
      title: 'Series 1',
      type: 'scatterPlot',
      values: [
        {x: 1421971200000, y: 25},
        {x: 1422057600000, y: 30},
        {x: 1422144000000, y: 8},
        {x: 1422230400000, y: 22}
      ]
    }),
    Ember.Object.create({
      title: 'Series 2',
      type: 'lineGraph',
      values: [
        {x: 1421971200000, y: 15},
        {x: 1422057600000, y: 10},
        {x: 1422144000000, y: 28},
        {x: 1422230400000, y: 12}
      ]
    }),
    Ember.Object.create({
      title: 'Series 3',
      type: 'scatterPlot',
      values: [
        {x: 1421971200000, y: 28},
        {x: 1422057600000, y: 22},
        {x: 1422144000000, y: 30},
        {x: 1422230400000, y: 5}
      ]
    })
  ])
});
