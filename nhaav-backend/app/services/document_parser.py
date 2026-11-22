import re


class DocumentParser:

    @staticmethod
    def extract_fields(text: str):

        fields = {}

        lines = text.split("\n")

        for line in lines:

            if "name" in line.lower():

                parts = line.split(":")

                if len(parts) > 1:
                    fields["holder_name"] = parts[-1].strip()

        return fields

    @staticmethod
    def detect_document(text: str):

        text = text.upper()

        if "APPLICATION FOR VENDOR REGISTRATION" in text:
            return "vendor_registration"

        if "FORM NO. 10F" in text:
            return "form10f"

        if "KNOW YOUR COUNTERPARTY" in text:
            return "kyc"

        if "NO PERMANENT ESTABLISHMENT" in text:
            return "no_pe"

        # Invoice Detection
        invoice_keywords = [
            "INVOICE",
            "GSTIN",
            "IRN",
            "HSN",
            "CGST",
            "SGST",
            "EWAY",
            "AMOUNT",
            "PLACE OF SUPPLY"
        ]

        score = 0

        for keyword in invoice_keywords:
            if keyword in text:
                score += 1

        if score >= 3:
            return "invoice"

        return "other"