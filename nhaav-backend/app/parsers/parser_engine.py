import re


class ParserEngine:

    @staticmethod
    def extract(text: str, template: dict):

        # Normalize lines
        lines = [
            re.sub(r"\s+", " ", line).strip()
            for line in text.splitlines()
            if line.strip()
        ]

        data = {}

        # Build one list of every possible label
        all_labels = []

        for labels in template.values():
            all_labels.extend(labels)

        def is_new_label(line: str, current_labels: list[str]) -> bool:
            """
            Returns True if this line starts another field.
            """

            lower = line.lower()

            for labels in template.values():
                for label in labels:
                    if label.lower() in lower:
                        if label not in current_labels:
                            return True

            return False

        for field, labels in template.items():

            data[field] = None

            found = False

            for i, line in enumerate(lines):

                for label in labels:

                    pattern = re.escape(label)

                    ##################################################
                    # CASE 1
                    # Label : Value
                    ##################################################

                    m = re.search(
                        rf"{pattern}\s*:\s*(.+)",
                        line,
                        re.IGNORECASE,
                    )

                    if m:

                        value = m.group(1).strip()

                        if value:
                            data[field] = value
                            found = True
                            break

                    ##################################################
                    # CASE 2
                    # Label Value
                    ##################################################

                    m = re.search(
                        rf"{pattern}\s+(.+)",
                        line,
                        re.IGNORECASE,
                    )

                    if m:

                        value = m.group(1).strip()

                        # Prevent capturing another label
                        if value and not any(
                            lbl.lower() in value.lower()
                            for lbl in all_labels
                            if lbl.lower() != label.lower()
                        ):
                            data[field] = value
                            found = True
                            break

                    ##################################################
                    # CASE 3
                    # Label
                    # Value
                    ##################################################

                    if label.lower() in line.lower():

                        collected = []

                        j = i + 1

                        while j < len(lines):

                            nxt = lines[j].strip()

                            if not nxt:
                                j += 1
                                continue

                            if is_new_label(nxt, labels):
                                break

                            collected.append(nxt)

                            j += 1

                        if collected:

                            value = " ".join(collected).strip()

                            if value:
                                data[field] = value
                                found = True
                                break

                if found:
                    break

        return data