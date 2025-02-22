# Xray Data Extractor Worker

## Overview
The **Xray Data Extractor Worker** automates the generation and management of vulnerability and violation reports using JFrog Xray APIs. This worker interacts with JFrog's platform services to generate reports, list available reports, and delete old reports if needed.

## Deployment
To deploy the worker, use the following command:

```bash
jf worker deploy xray-data-extractor
```

## Execution
To trigger the worker manually, use the following command:

```bash
jf worker dr test-run xray-data-extractor '{}'
```

## Configuration
### Variables

| Variable        | Type    | Default Value | Description |
|----------------|--------|--------------|-------------|
| `reportType`   | string | `violations`  | Defines the type of report to generate (`violations` or `vulnerabilities`). |
| `cleanReports` | bool   | `false`       | If `true`, the worker will delete existing reports before generating a new one. |

### Functions

#### `generateReportName()`
Generates a unique report name based on the current date.

```typescript
function generateReportName(): string {
  return `worker_xray_report_${new Date().toISOString().split('T')[0]}`;
}
```

#### `createReportPayload(reportName: string)`
Creates the payload for report generation.

```typescript
function createReportPayload(reportName: string): object {
  return {
    name: reportName,
    resources: {
      projects: {
        names: [],
        include_key_patterns: ["**"],
        number_of_latest_versions: 5
      }
    },
    filters: {
      vulnerable_component: "",
      impacted_artifact: "",
      cve: "",
      issue_id: "",
      severities: []
    }
  };
}
```

#### `generateVulnerabilitiesReport(context: PlatformContext, payload: object, reportName: string)`
Triggers a vulnerability report.

```typescript
async function generateVulnerabilitiesReport(context: PlatformContext, payload: object, reportName: string): Promise<string> {
  const res = await context.clients.platformHttp.post('/xray/api/v1/reports/vulnerabilities', payload, { headers: { 'Content-Type': 'application/json' } });
  return res.data.report_id;
}
```

#### `generateViolationsReport(context: PlatformContext, payload: object, reportName: string)`
Triggers a violations report.

```typescript
async function generateViolationsReport(context: PlatformContext, payload: object, reportName: string): Promise<string> {
  const res = await context.clients.platformHttp.post('/xray/api/v1/reports/violations', payload, { headers: { 'Content-Type': 'application/json' } });
  return res.data.report_id;
}
```

#### `listReports(context: PlatformContext)`
Retrieves a list of generated reports.

```typescript
async function listReports(context: PlatformContext): Promise<{ reportIds: string[], reportNames: string[] }> {
  const reportList = await context.clients.platformHttp.post('/xray/api/v1/reports?direction=desc&page_num=1&num_of_rows=10&order_by=start_time', { headers: { 'Content-Type': 'application/json' } });
  const filteredReports = reportList.data.reports.filter(report => report.name.startsWith('worker_xray_report_'));
  return { reportIds: filteredReports.map(r => r.id), reportNames: filteredReports.map(r => r.name) };
}
```

#### `deleteReports(context: PlatformContext, reportIds: string[])`
Deletes specified reports.

```typescript
async function deleteReports(context: PlatformContext, reportIds: string[]): Promise<void> {
  for (const reportId of reportIds) {
    await context.clients.platformHttp.delete(`/xray/api/v1/reports/${reportId}`, { headers: { 'Content-Type': 'application/json' } });
  }
}
```

## Workflow
1. If `cleanReports` is enabled, the worker deletes existing reports before proceeding.
2. A new report is generated based on `reportType`.
3. The system fetches the list of reports and logs the details of the newly created report.

## Example Output
When the worker runs successfully, it will output:

```json
{
  "message": "Vulnerabilities report worker_xray_report_2025-02-22 was successfully generated."
}
```

