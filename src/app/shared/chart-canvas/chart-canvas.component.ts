import { Component, DestroyRef, effect, ElementRef, inject, input, viewChild } from "@angular/core";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Legend, Tooltip);

/** One Chart.js chart. The canvas is an image to assistive technology; `summary` is what it says. */
@Component({
  selector: "app-chart-canvas",
  templateUrl: "./chart-canvas.component.html",
  styleUrl: "./chart-canvas.component.scss",
})
export class ChartCanvasComponent {
  readonly config = input.required<ChartConfiguration>();
  readonly summary = input.required<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");
  private chart: Chart | null = null;

  constructor() {
    // Rebuilt rather than updated: configs are recomputed whole when data or theme change.
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  /** The chart as PNG bytes, painted on the page background so it reads the same anywhere. */
  async pngBytes(background: string): Promise<Uint8Array> {
    const source = this.canvas().nativeElement;
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const context = copy.getContext("2d");
    if (!context) throw new Error("The browser could not draw the chart as an image.");
    context.fillStyle = background;
    context.fillRect(0, 0, copy.width, copy.height);
    context.drawImage(source, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => copy.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The browser could not draw the chart as an image.");
    return new Uint8Array(await blob.arrayBuffer());
  }
}
