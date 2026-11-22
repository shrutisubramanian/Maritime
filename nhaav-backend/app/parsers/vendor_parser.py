import re


class VendorParser:

    # The contact block lists its four question lines a)-d) first and the four
    # answers a)-d) further down, so "the line after the label" is the NEXT
    # question. These stems identify a question line by its own text.
    CONTACT_QUESTIONS = {
        "a": ("address for correspondence",),
        "b": ("telephone", "mobile", "fax"),
        "c": ("email",),
        "d": ("website",),
    }

    @staticmethod
    def _clean_lines(text: str):
        """
        Convert document text into clean non-empty lines.
        """
        return [
            re.sub(r"\s+", " ", line).strip()
            for line in text.splitlines()
            if line.strip()
        ]

    @staticmethod
    def _is_section(line: str):
        """
        Detect numbered sections like:
        2.
        15.
        24.
        """
        return re.fullmatch(r"\d+\.", line) is not None

    @classmethod
    def _value_after(cls, lines, label):
        """
        Returns the first non-empty line after a label.
        Good for fields like:
        Name
        Value
        """
        for i, line in enumerate(lines):

            if label.lower() == line.lower():

                j = i + 1

                while j < len(lines):

                    value = lines[j].strip()

                    if value:

                        if cls._is_section(value):
                            return None

                        return value

                    j += 1

        return None

    @classmethod
    def _labelled_answer(cls, lines, marker):
        """Return the VALUE line marked 'x)', skipping the matching QUESTION line.

        The previous lookup returned the first non-empty line after the label,
        which for this form was the next question, shifting every contact field
        by one ("email" came back as "d) Website"). An inline answer
        ("c) Email: a@b.c") is still accepted.
        """
        pattern = re.compile(rf"^{marker}\)\s*(.+)$", re.I)
        question_words = cls.CONTACT_QUESTIONS[marker]

        for line in lines:
            match = pattern.match(line)
            if not match:
                continue

            value = match.group(1).strip()

            if value.lower().startswith(question_words):
                inline = re.match(
                    rf"^(?:{'|'.join(question_words)})\s*:\s*(.+)$", value, re.I
                )
                if inline and inline.group(1).strip():
                    return inline.group(1).strip()
                continue

            return value or None

        return None

    @classmethod
    def _multiline_value(cls, lines, label):
        """
        Collects multiple lines until next numbered section.
        """

        collecting = False
        values = []

        for line in lines:

            if collecting:

                if cls._is_section(line):
                    break

                values.append(line)

            elif line.lower() == label.lower():
                collecting = True

        if not values:
            return None

        return " ".join(values).strip()

    @staticmethod
    def _regex(pattern, text):
        m = re.search(pattern, text, re.I)
        if m:
            return m.group(1).strip()
        return None

    @classmethod
    def extract(cls, text):

        lines = cls._clean_lines(text)

        data = {

            "vendor_name":
                cls._value_after(lines, "Name of the Vendor"),

            "legal_structure":
                cls._value_after(lines, "Legal Structure (Check One)"),

            "nationality":
                cls._value_after(lines, "Nationality"),

            "tax_residency":
                cls._multiline_value(lines, "Tax Residency of Vendor"),

            "incorporation_date":
                cls._value_after(lines, "Date of Incorporation/Formation"),

            "registered_office":
                cls._value_after(lines, "Registered Office Address"),

            "corporate_office":
                cls._value_after(lines, "Corporate Office Address"),

            "director":
                cls._multiline_value(
                    lines,
                    "Name of the Proprietor/Managing Partner/ Managing Director/Promoter and Designation",
                ),

            "shareholders":
                cls._multiline_value(
                    lines,
                    "Names of Shareholders and Shareholding Pattern",
                ),

            "correspondence_address":
                cls._labelled_answer(lines, "a"),

            "telephone":
                cls._labelled_answer(lines, "b"),

            "email":
                cls._labelled_answer(lines, "c"),

            "website":
                cls._labelled_answer(lines, "d"),

            "representative_name":
                cls._regex(r"Name:\s*(.*)", text),

            "representative_title":
                cls._regex(r"Title:\s*(.*)", text),

            "services":
                cls._multiline_value(
                    lines,
                    "Details of Services or Goods supplied",
                ),

            "msme":
                cls._multiline_value(
                    lines,
                    "MSME/ NSIC registration (if any)",
                ),

            "iso":
                cls._multiline_value(
                    lines,
                    "Whether the firm possess any of the following certifications? (i) ISO : 9001 (ii) ISO : 14001",
                ),

            "registration_number":
                cls._regex(
                    r"Registration No:\s*([A-Za-z0-9/\-]+)",
                    text,
                ),

            "pan":
                cls._regex(
                    r"PAN:\s*([A-Z0-9]+)",
                    text,
                ),

            "gst":
                cls._regex(
                    r"GSTIN:\s*([A-Z0-9]+)",
                    text,
                ),

            "tin":
                cls._multiline_value(
                    lines,
                    "TIN details",
                ),

            "tan":
                cls._regex(
                    r"TAN:\s*([A-Z0-9]+)",
                    text,
                ),

            "bank_name":
                cls._value_after(lines, "24. Banking Information"),

            "branch":
                None,

            "beneficiary":
                None,

            "account_number":
                None,

            "iban":
                None,

            "swift":
                None,

            "ifsc":
                None,
        }

        # Parse banking block separately
        try:
            idx = lines.index("24. Banking Information")
        except ValueError:
            try:
                idx = lines.index("Banking Information")
            except ValueError:
                idx = -1

        if idx != -1:

            bank_lines = []

            for line in lines[idx + 1:]:

                if cls._is_section(line):
                    break

                bank_lines.append(line)

            # The bank rows are POSITIONAL: (a) bank, (b) branch, (c)
            # beneficiary, (d) account, (e) IBAN, (f) SWIFT, (g) IFSC. Dropping
            # an empty-looking row ("Not Applicable", a real vendor answer for
            # the IBAN) moved every later value up one slot: SWIFT was read as
            # the IFSC, and the IFSC came from the next section entirely.
            filtered = []
            for line in bank_lines:
                text = re.sub(r"^\(?[a-i]\)\s*", "", line).strip()
                if not text:
                    continue
                if text.startswith("(Blank, cancelled cheque"):
                    continue
                if text.lower().startswith("additional information"):
                    break
                filtered.append(text)

            if len(filtered) >= 6:

                data["bank_name"] = filtered[0]
                data["branch"] = filtered[1]
                data["beneficiary"] = filtered[2]
                data["account_number"] = filtered[3]
                data["iban"] = filtered[4]
                data["swift"] = filtered[5]

                if len(filtered) >= 7:
                    data["ifsc"] = filtered[6]

        return data