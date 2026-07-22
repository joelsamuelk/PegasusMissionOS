import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntityStatusBadge } from "@/components/shared/StatusBadge";

describe("EntityStatusBadge", () => {
  it("renders a readable label so meaning does not rely on colour alone", () => {
    render(<EntityStatusBadge status="approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("humanises unknown statuses", () => {
    render(<EntityStatusBadge status="some_custom_state" />);
    expect(screen.getByText("some custom state")).toBeInTheDocument();
  });

  it("maps grant health states to labels", () => {
    render(<EntityStatusBadge status="at_risk" />);
    expect(screen.getByText("At risk")).toBeInTheDocument();
  });
});
