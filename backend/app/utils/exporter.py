import os
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List

def generate_pdf_report(
    output_path: Path,
    project_name: str,
    project_desc: str,
    map_version: int,
    walls: List[Dict],
    doors: List[Dict],
    rooms: List[Dict],
    bounds: Dict,
    uncertainty_notes: str
) -> bool:
    """
    Generates a professional, genuine PDF report of the 2D floor plan reconstruction.
    """
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.graphics.shapes import Drawing, Rect, Line, String, Group

        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=22,
            leading=26,
            textColor=colors.HexColor('#14243A'),
            spaceAfter=4
        )
        subtitle_style = ParagraphStyle(
            'ReportSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=11,
            leading=14,
            textColor=colors.HexColor('#64748B'),
            spaceAfter=15
        )
        section_style = ParagraphStyle(
            'SectionTitle',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=14,
            leading=18,
            textColor=colors.HexColor('#14243A'),
            spaceBefore=10,
            spaceAfter=8
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            textColor=colors.HexColor('#172334')
        )
        alert_style = ParagraphStyle(
            'Alert',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor('#B45309')
        )

        # Header
        current_time_str = datetime.now(timezone.utc).strftime('%B %d, %Y %H:%M UTC')
        story.append(Paragraph("MAPORAA &bull; Preliminary Floor Plan Report", title_style))
        story.append(Paragraph(f"Project: <b>{project_name}</b> | Revision v{map_version} | Generated: {current_time_str}", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#16B8A6'), spaceBefore=0, spaceAfter=12))

        # Project summary table
        info_data = [
            ["Project Name", project_name, "Reconstruction Version", f"Version {map_version}"],
            ["Estimated Dimensions", f"{bounds.get('width', 0)}m &times; {bounds.get('height', 0)}m", "Total Walls Detected", str(len(walls))],
            ["Inferred Rooms", str(len(rooms)), "Doorways Located", str(len(doors))]
        ]
        info_table = Table(info_data, colWidths=[130, 140, 130, 140])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#172334')),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 8.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 14))

        # Floor Plan Drawing Canvas
        story.append(Paragraph("2D Floor Plan Layout Preview", section_style))
        draw_w = 540
        draw_h = 240
        drawing = Drawing(draw_w, draw_h)
        drawing.add(Rect(0, 0, draw_w, draw_h, fillColor=colors.HexColor('#F5F7FA'), strokeColor=colors.HexColor('#CBD5E1'), strokeWidth=1))

        # Scale geometry to fit drawing
        min_x = bounds.get('minX', -5)
        min_y = bounds.get('minY', -5)
        max_x = bounds.get('maxX', 5)
        max_y = bounds.get('maxY', 5)
        gw = max(1.0, max_x - min_x)
        gh = max(1.0, max_y - min_y)
        scale = min((draw_w - 60) / gw, (draw_h - 40) / gh)
        off_x = (draw_w - (gw * scale)) / 2.0
        off_y = (draw_h - (gh * scale)) / 2.0

        def to_canvas(x, y):
            cx = off_x + (x - min_x) * scale
            cy = off_y + (y - min_y) * scale
            return cx, cy

        # Draw walls
        for w in walls:
            x1, y1 = to_canvas(w['x1'], w['y1'])
            x2, y2 = to_canvas(w['x2'], w['y2'])
            col = colors.HexColor('#14243A') if w.get('type') == 'exterior' else colors.HexColor('#475569')
            drawing.add(Line(x1, y1, x2, y2, strokeColor=col, strokeWidth=2.5))

        # Draw room labels
        for r in rooms:
            poly = r.get('polygon', [])
            if poly:
                cx = sum(p[0] for p in poly) / len(poly)
                cy = sum(p[1] for p in poly) / len(poly)
                canvas_x, canvas_y = to_canvas(cx, cy)
                drawing.add(String(canvas_x - 30, canvas_y, r.get('name', 'Room'), fontName='Helvetica-Bold', fontSize=8, fillColor=colors.HexColor('#16B8A6')))

        story.append(drawing)
        story.append(Spacer(1, 14))

        # Room Breakdown Table
        story.append(Paragraph("Identified Rooms & Spaces", section_style))
        room_table_data = [["Room ID", "Assigned Label", "Geometry Vertices", "Status"]]
        for r in rooms:
            room_table_data.append([
                r.get('id', '-'),
                r.get('name', 'Unnamed Room'),
                f"{len(r.get('polygon', []))} boundary points",
                "Preliminary AI Inference"
            ])
        if len(rooms) == 0:
            room_table_data.append(["-", "No closed room loops inferred", "-", "-"])

        r_table = Table(room_table_data, colWidths=[80, 200, 140, 120])
        r_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#14243A')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 8.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
        ]))
        story.append(r_table)
        story.append(Spacer(1, 14))

        # Limitations & Disclaimers
        story.append(Paragraph("Reconstruction Limitations & Important Notes", section_style))
        disclaimer_text = (
            f"<b>Notice:</b> {uncertainty_notes or 'Monocular video processing relies on estimated camera trajectory and relative depth fields. '}"
            "Real-world scale (metric scale factor) is uncalibrated and subject to perspective drift. "
            "This document is intended as a preliminary floor plan sketch. For structural or architectural permits, certified laser measurements are required."
        )
        story.append(Paragraph(disclaimer_text, alert_style))

        doc.build(story)
        return True
    except Exception as e:
        # Fallback to text file if reportlab has an issue
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"MAPORAA Report - {project_name}\nVersion: {map_version}\nWalls: {len(walls)}\nRooms: {len(rooms)}\nNotes: {uncertainty_notes}")
        return False
