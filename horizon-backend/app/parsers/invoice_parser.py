import re


class InvoiceParser:

    @staticmethod
    def parse(text: str):

        data = {}

        invoice = re.search(
            r"Invoice No\.?\s*:?\s*(.+)",
            text,
            re.IGNORECASE
        )

        if invoice:
            data["invoice_number"] = invoice.group(1).strip()

        gst = re.search(
            r"GSTIN\s*:?\s*([A-Z0-9]+)",
            text,
            re.IGNORECASE
        )

        if gst:
            data["gstin"] = gst.group(1).strip()

        date = re.search(
            r"Date\s*:?\s*([0-9\-\/]+)",
            text,
            re.IGNORECASE
        )

        if date:
            data["invoice_date"] = date.group(1).strip()

        return data