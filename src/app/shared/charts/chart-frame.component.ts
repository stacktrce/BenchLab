import { Component, ElementRef, inject, input } from "@angular/core";
import { chartFileName } from "../../core/charts/svg-export";
import { errorMessage } from "../../core/errors";
import { FileExportService } from "../../core/file-export.service";
import { ToastService } from "../../core/toast.service";
import { chartPngBytes, chartSvgText } from "./chart-image";

/** A chart with its title, a note, and the same numbers as a table for anyone who cannot read the picture. */
@Component({
  selector: "app-chart-frame",
  template: `
    <figure>
      <figcaption>
        <span class="title">{{ title() }}</span>
        <ng-content select="[chartTools]" />
        @if (hasChart()) {
          <span class="save">
            <button type="button" class="bare" (click)="saveSvg()" [attr.aria-label]="'Save ' + title() + ' as SVG'">SVG</button>
            <button type="button" class="bare" (click)="savePng()" [attr.aria-label]="'Save ' + title() + ' as PNG'">PNG</button>
          </span>
        }
      </figcaption>
      <ng-content />
      @if (note(); as text) {
        <p class="note">{{ text }}</p>
      }
      @if (table().rows.length) {
        <details>
          <summary>Show data</summary>
          <div class="scroll" tabindex="0" role="region" [attr.aria-label]="title() + ' data'">
            <table>
              <thead>
                <tr>
                  @for (column of table().columns; track $index) {
                    <th scope="col">{{ column }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of table().rows; track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td class="num">{{ cell }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      }
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
    }
    figcaption {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 4px;
    }
    .save {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }
    .title {
      color: var(--ink-2);
      font-size: 12px;
    }
    .note {
      margin: 4px 0 0;
      color: var(--ink-2);
      font-size: 12px;
    }
    details {
      margin-top: 8px;
    }
    summary {
      cursor: pointer;
      color: var(--ink-2);
      font-size: 12px;
    }
    .scroll {
      max-height: 220px;
      overflow: auto;
      margin-top: 6px;
    }
  `,
})
export class ChartFrameComponent {
  readonly title = input.required<string>();
  readonly note = input<string | null>(null);
  readonly table = input.required<{ columns: string[]; rows: string[][] }>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly files = inject(FileExportService);
  private readonly toast = inject(ToastService);

  protected hasChart(): boolean {
    return this.table().rows.length > 0;
  }

  protected async saveSvg(): Promise<void> {
    const svg = this.svg();
    if (svg) await this.files.save(chartFileName(this.title(), "svg"), chartSvgText(svg, this.title()).text, "svg");
  }

  protected async savePng(): Promise<void> {
    const svg = this.svg();
    if (!svg) return;
    try {
      await this.files.saveImage(chartFileName(this.title(), "png"), await chartPngBytes(svg, this.title()));
    } catch (e) {
      this.toast.show(`Export failed: ${errorMessage(e)}`, "error");
    }
  }

  private svg(): SVGSVGElement | null {
    return this.host.nativeElement.querySelector("figure svg");
  }
}
