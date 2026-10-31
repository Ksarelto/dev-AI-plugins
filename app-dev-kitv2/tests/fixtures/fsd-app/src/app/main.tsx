import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CheckoutPage } from "@/pages/checkout";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CheckoutPage />
  </StrictMode>,
);
