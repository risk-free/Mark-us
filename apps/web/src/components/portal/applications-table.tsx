import type { ApplicationItem } from "@/lib/portal-api";

export interface ApplicationTableLabels {
  serial: string;
  status: string;
  filed: string;
  deadline: string;
  notFiled: string;
  view: string;
}

/**
 * Read-only applications table (P2.6). Own-data-only is enforced API-side
 * (x-scope own-contact); this component renders exactly the items it is given
 * and nothing else — there is no prop by which another contact's id could be
 * supplied.
 */
export function ApplicationsTable({
  applications,
  labels,
  detailHref,
}: {
  applications: ApplicationItem[];
  labels: ApplicationTableLabels;
  detailHref: (id: string) => string;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{labels.serial}</th>
          <th scope="col">{labels.status}</th>
          <th scope="col">{labels.filed}</th>
          <th scope="col">{labels.deadline}</th>
          <th scope="col">
            <span className="sr-only">{labels.view}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {applications.map((application) => (
          <tr key={application.id}>
            <td>{application.serialNumber}</td>
            <td>{application.status}</td>
            <td>{application.filingDate ?? labels.notFiled}</td>
            <td>{application.deadlineAt ?? "—"}</td>
            <td>
              <a href={detailHref(application.id)}>{labels.view}</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
