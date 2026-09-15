import * as echarts from 'echarts/core';
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components';
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { initStorage } from './storage.js';
import { main } from './reports-main.js';

echarts.use([
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  BarChart,
  HeatmapChart,
  LineChart,
  CanvasRenderer
]);

initStorage().then(main).catch((err) => {
  console.error('[OpenAgile] Failed to initialise storage for reports:', err);
  main(); // attempt to render with empty state rather than blank page
});
