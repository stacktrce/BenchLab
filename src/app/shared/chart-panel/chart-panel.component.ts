import { Component, inject, input, viewChild } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ChartConfiguration } from "chart.js";
import { ChartModel } from "../../core/charts/chart-configs";
import { ChartPaletteService } from "../../core/chart-palette.service";
import { errorMessage } from "../../core/errors";
import { exportFileName, FileExportService } from "../../core/file-export.service";
import { ToastService } from "../../core/toast.service";
import { ChartCanvasComponent } from "../chart-canvas/chart-canvas.component";

/** A titled chart with its caveats, a PNG export, and the same numbers as a table. */
@Component({
  selector: "app-chart-panel",
  imports: [ChartCanvasComponent, RouterLink],
  templateUrl: "./chart-panel.component.html",
  styleUrl: "./chart-panel.component.scss",
})
export class ChartPanelComponent {
  readonly title = input.required<string>();
  readonly model = input.required<ChartModel<"bar"> | ChartModel<"line">>();
  /** Router links for the first cell of each table row, when rows stand for runs. */
  readonly rowLinks = input<string[][] | null>(null);

  private readonly canvas = viewChild(ChartCanvasComponent);
  private readonly palette = inject(ChartPaletteService);
  private readonly files = inject(FileExportService);
  private readonly toast = inject(ToastService);

  protected config(): ChartConfiguration {
    return this.model().config as ChartConfiguration;
  }

  protected async savePng(): Promise<void> {
    const canvas = this.canvas();
    if (!canvas) return;
    try {
      const bytes = await canvas.pngBytes(this.palette.palette().background);
      await this.files.saveImage(exportFileName(this.title(), "png"), bytes);
    } catch (e) {
      this.toast.show(`Export failed: ${errorMessage(e)}`, "error");
    }
  }
}
