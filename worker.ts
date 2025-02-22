import { PlatformContext } from 'jfrog-workers';

const reportType: string = 'violations'; // Change to 'violations' to generate a violations report
const cleanReports = false; // Set to clean up reports instead of generating a new one


/**
 * Interface representing the response of a scheduled event.
 */
interface ScheduledEventResponse {
  message: string;
}

/**
 * Interface representing the details of a report.
 */
interface ReportDetail {
  id: string;
  status: string;
  name: string;
  progress: number;
}

/**
 * Generates a dynamic report name based on the current date.
 * @returns {string} The generated report name.
 */
function generateReportName(): string {
  return `worker_xray_report_${new Date().toISOString().split('T')[0]}`;
}

/**
 * Creates the payload for the report.
 * @param {string} reportName - The name of the report.
 * @returns {object} The report payload.
 */
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

/**
 * Calls the API to generate the vulnerabilities report.
 * @param {PlatformContext} context - The platform context.
 * @param {object} payload - The report payload.
 * @param {string} reportName - The name of the report.
 * @returns {Promise<string>} The ID of the generated report.
 */
async function generateVulnerabilitiesReport(context: PlatformContext, payload: object, reportName: string): Promise<string> {
  try {
    const res = await context.clients.platformHttp.post(
      '/xray/api/v1/reports/vulnerabilities',
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (res.status === 200 || res.status < 400) {
      return res.data.report_id; // Returning the report ID
    } else {
      console.warn(`Request succeeded but returned a non-200 status: ${res.status}`);
      throw new Error(`Failed to generate the vulnerabilities report: ${res.status}`);
    }
  } catch (error) {
    console.error(`Request failed with status ${error.response?.status || "<none>"}: ${error.message}`);
    throw new Error(`Failed to generate the vulnerabilities report: ${error.message}`);
  }
}

/**
 * Calls the API to generate the violations report.
 * @param {PlatformContext} context - The platform context.
 * @param {object} payload - The report payload.
 * @param {string} reportName - The name of the report.
 * @returns {Promise<string>} The ID of the generated report.
 */
async function generateViolationsReport(context: PlatformContext, payload: object, reportName: string): Promise<string> {
  try {
    const res = await context.clients.platformHttp.post(
      '/xray/api/v1/reports/violations',
      {
        ...payload,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (res.status === 200 || res.status < 400) {
      return res.data.report_id; // Returning the report ID
    } else {
      console.warn(`Request succeeded but returned a non-200 status: ${res.status}`);
      throw new Error(`Failed to generate the violations report: ${res.status}`);
    }
  } catch (error) {
    console.error(`Request failed with status ${error.response?.status || "<none>"}: ${error.message}`);
    throw new Error(`Failed to generate the violations report: ${error.message}`);
  }
}

/**
 * Lists the available reports and filters those whose name starts with 'worker_xray_report_'.
 * @param {PlatformContext} context - The platform context.
 * @returns {Promise<{ reportIds: string[], reportNames: string[] }>} The IDs and names of the filtered reports.
 */
async function listReports(context: PlatformContext): Promise<{ reportIds: string[], reportNames: string[] }> {
  try {
    const reportList = await context.clients.platformHttp.post(
      `/xray/api/v1/reports?direction=desc&page_num=1&num_of_rows=10&order_by=start_time`,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (reportList.status === 200 || reportList.status < 400) {
      console.log('All Reports:', reportList.data.reports); // Log all reports before filtering
      const filteredReports = reportList.data.reports.filter((report: ReportDetail) => 
        report.name.startsWith('worker_xray_report_')
      );
      console.log('Filtered Reports:', filteredReports); // Log the filtered reports

      if (filteredReports.length === 0) {
        console.warn('No reports found with the specified name pattern.');
        return { reportIds: [], reportNames: [] };
      }

      const reportIds = filteredReports.map((report: ReportDetail) => report.id);
      const reportNames = filteredReports.map((report: ReportDetail) => report.name);

      return { reportIds, reportNames };
    } else {
      console.warn(`Request succeeded but returned a non-200 status: ${reportList.status}`);
      throw new Error(`Failed to retrieve the reports: ${reportList.status}`);
    }
  } catch (error) {
    console.error(`Request failed with status ${error.response?.status || "<none>"}: ${error.message}`);
    throw new Error(`Failed to retrieve the reports: ${error.message}`);
  }
}

/**
 * Deletes the specified reports by their IDs.
 * @param {PlatformContext} context - The platform context.
 * @param {string[]} reportIds - The IDs of the reports to delete.
 * @returns {Promise<void>}
 */
async function deleteReports(context: PlatformContext, reportIds: string[]): Promise<void> {
  try {
    for (const reportId of reportIds) {
      const res = await context.clients.platformHttp.delete(
        `/xray/api/v1/reports/${reportId}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (res.status === 200 || res.status < 400) {
        console.log(`Successfully deleted report with ID: ${reportId}`);
      } else {
        console.warn(`Failed to delete report with ID: ${reportId}, status: ${res.status}`);
      }
    }
  } catch (error) {
    console.error(`Failed to delete reports: ${error.message}`);
  }
}

/**
 * Main function to handle the scheduled event.
 * @param {PlatformContext} context - The platform context.
 * @returns {Promise<ScheduledEventResponse>} The response of the scheduled event.
 */
export default async function (
  context: PlatformContext
): Promise<ScheduledEventResponse> {

  if (cleanReports) {
    try {
      // Trigger deploy report to get the list of reports
      const { reportIds } = await listReports(context);

      if (reportIds.length > 0) {
        // Delete the reports
        await deleteReports(context, reportIds);
        return {
          message: `Successfully deleted ${reportIds.length} reports.`,
        };
      } else {
        return {
          message: 'No reports found to delete.',
        };
      }
    } catch (error) {
      return {
        message: error.message,
      };
    }
  } else {
    const reportName = generateReportName();
    const payload = createReportPayload(reportName);

    try {
      // Generate the vulnerabilities report

      if (reportType === 'vulnerabilities') {
        await generateVulnerabilitiesReport(context, payload, reportName);
      } else if (reportType === 'violations') {
        await generateViolationsReport(context, payload, reportName);
      } else {
        throw new Error(`Unknown report type: ${reportType}`);
      }

      // Trigger deploy report
      const { reportIds } = await listReports(context);

      if (reportIds.length > 0) {
        console.log(`Report created with name: ${reportName} and ID: ${reportIds[0]}`);
      } else {
        console.log(`Report created with name: ${reportName} but no report ID was found.`);
      }

    } catch (error) {
      return {
        message: error.message,
      };
    }

    return {
      message: `Vulnerabilities report ${reportName} was successfully generated.`,
    };
  }
}
